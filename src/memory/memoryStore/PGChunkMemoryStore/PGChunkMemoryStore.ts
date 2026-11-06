import { createHash, randomUUID } from 'node:crypto';
import { EmbeddingPurpose } from '../../../network/embeddingModel/AbstractEmbeddingModel';
import {
	OllamaEmbedder,
	OllamaEmbeddingModel,
} from '../../../network/embeddingModel/OllamaEmbedder';
import { CloudflareRerankerModel } from '../../../network/rerankingModel/CloudflareReranker';
import { AbstractRerankingModel } from '../../../network/rerankingModel/AbstractRerankingModel';
import { ChunkingStrategyType } from '../../../utils/chunking/strategies/ChunkingStrategy';
import { TextChunker } from '../../../utils/chunking/TextChunker';
import { AppDataSource } from '../../../database/data-source';
import { RAGChunkRepository } from '../../data/RAGChunkRepository';
import { RAGDocumentRepository } from '../../data/RAGDocumentRepository';
import {
	MEMORY_TYPE,
	MemoryFragment,
	MemoryRetrievalContext,
	PreferenceGroupIndexEntry,
} from '../../core/Interfaces';
import { RAGChunk } from '../../model/RAGChunk';
import { RAGDocument } from '../../model/RAGDocument';
import { AbstractMemoryStore } from '../AbstractMemoryStore';

const CHUNK_SIZE_LIMIT = 1000;
const CHUNK_OVERLAP = 100;
const DEFAULT_CHUNK_RETRIEVAL_LIMIT = 20;
const DEFAULT_RETRIEVAL_RESULT_LIMIT = 5;
const RRF_K = 60;

export class PGChunkMemoryStore extends AbstractMemoryStore {
	private readonly chunker = new TextChunker();
	private readonly embedder = new OllamaEmbedder({});

	public constructor(
		private readonly documentRepository: RAGDocumentRepository,
		private readonly chunkRepository: RAGChunkRepository,
		private readonly reranker: AbstractRerankingModel<CloudflareRerankerModel>,
	) {
		super();
	}

	public async store(memory: MemoryFragment): Promise<void> {
		const now = new Date();
		const documentId = randomUUID();
		const chunks = this.chunker.chunk(
			{ content: memory.content },
			ChunkingStrategyType.FIXED_WINDOW,
			CHUNK_SIZE_LIMIT,
			CHUNK_OVERLAP,
		);
		const embeddings = (
			await this.embedder.embed(
				chunks.map(({ content }) => content),
				EmbeddingPurpose.INDEXING,
				OllamaEmbeddingModel.EMBEDDINGGEMMA_2_270M,
			)
		).map((embedding) => this.normalizeEmbedding(embedding));

		await AppDataSource.transaction(async (manager) => {
			await this.documentRepository.store(
				new RAGDocument({
					id: documentId,
					sourceReference: null,
					title: null,
					contentHash: createHash('sha256').update(memory.content).digest('hex'),
					documentMetadata: {
						type: memory.type,
						created: memory.created.toISOString(),
						tags: memory.tags,
						origin: memory.origin,
						additionalContext: memory.additionalContext,
					},
					createdAt: now,
					updatedAt: now,
				}),
				manager,
			);

			for (const [index, chunk] of chunks.entries()) {
				await this.chunkRepository.store(
					new RAGChunk({
						id: randomUUID(),
						documentId,
						content: chunk.content,
						ordinal: chunk.ordinal,
						location: chunk.location,
						documentChunkMetadata: {
							type: memory.type,
							created: memory.created.toISOString(),
							tags: memory.tags,
							origin: memory.origin,
							additionalContext: memory.additionalContext,
						},
						chunkingMetadata: chunk.chunkingMetadata,
						createdAt: now,
					}),
					embeddings[index],
					OllamaEmbeddingModel.EMBEDDINGGEMMA_2_270M,
					manager,
				);
			}
		});
	}

	public async retrieve(context: MemoryRetrievalContext): Promise<Partial<MemoryFragment[]>> {
		const [semanticChunks, lexicalChunks] = await Promise.all([
			this.retrieveSemanticChunks(context),
			this.retrieveLexicalChunks(context),
		]);

		// TODO: Query Transformaation

		const fusedChunks = this.reciprocalRankFusion(semanticChunks, lexicalChunks);
		const rerankedChunks = await this.reranker.rerank(
			context.context.query,
			fusedChunks.map(({ content }) => content),
			CloudflareRerankerModel.BGE_RERANKER_BASE,
		);
		const chunks = rerankedChunks.map(({ index }) => fusedChunks[index]);

		// Return top 5 chunks
		const resultLength =
			chunks.length > DEFAULT_RETRIEVAL_RESULT_LIMIT
				? DEFAULT_RETRIEVAL_RESULT_LIMIT
				: chunks.length;
		const resultSet = chunks.slice(0, resultLength).map(toMemoryFragment);

		// TODO:

		return resultSet;
	}

	private async retrieveSemanticChunks(context: MemoryRetrievalContext): Promise<RAGChunk[]> {
		const [queryEmbedding] = await this.embedder.embed(
			[context.context.query],
			EmbeddingPurpose.RETRIEVAL,
			OllamaEmbeddingModel.EMBEDDINGGEMMA_2_270M,
		);
		const normalizedQueryEmbedding = this.normalizeEmbedding(queryEmbedding);
		const searchArguments = [
			normalizedQueryEmbedding,
			OllamaEmbeddingModel.EMBEDDINGGEMMA_2_270M,
			context.limit ?? DEFAULT_CHUNK_RETRIEVAL_LIMIT,
			context.filters,
		] as const;
		return this.chunkRepository.findDotProductSimilar(...searchArguments);
	}

	private async retrieveLexicalChunks(context: MemoryRetrievalContext): Promise<RAGChunk[]> {
		return this.chunkRepository.findLexical(
			context.context.query,
			context.limit ?? DEFAULT_CHUNK_RETRIEVAL_LIMIT,
			context.filters,
		);
	}

	private reciprocalRankFusion(
		semanticChunks: RAGChunk[],
		lexicalChunks: RAGChunk[],
	): RAGChunk[] {
		const fusedChunks = new Map<string, { chunk: RAGChunk; score: number; order: number }>();
		let order = 0;

		for (const searchResultSet of [semanticChunks, lexicalChunks]) {
			searchResultSet.forEach((chunk, index) => {
				const result = fusedChunks.get(chunk.id) ?? {
					chunk,
					score: 0,
					order: order++,
				};
				result.score += 1 / (RRF_K + index + 1);
				fusedChunks.set(chunk.id, result);
			});
		}

		return [...fusedChunks.values()]
			.sort((left, right) => right.score - left.score || left.order - right.order)
			.map(({ chunk }) => chunk);
	}

	private normalizeEmbedding(embedding: number[]): number[] {
		const norm = Math.hypot(...embedding);
		if (norm === 0) {
			throw new RangeError('Cannot normalize a zero-length embedding.');
		}

		return embedding.map((value) => value / norm);
	}

	public async listPreferenceGroups(): Promise<PreferenceGroupIndexEntry[]> {
		return [];
	}
}

function toMemoryFragment(chunk: RAGChunk): MemoryFragment {
	const metadata = chunk.documentChunkMetadata;
	return {
		created: new Date(String(metadata.created ?? chunk.createdAt.toISOString())),
		type: (metadata.type as MEMORY_TYPE | undefined) ?? MEMORY_TYPE.FACT,
		content: chunk.content,
		tags: Array.isArray(metadata.tags) ? (metadata.tags as string[]) : [],
		origin: metadata.origin === 'system' ? 'system' : 'user',
		additionalContext:
			typeof metadata.additionalContext === 'object' && metadata.additionalContext !== null
				? (metadata.additionalContext as Record<string, unknown>)
				: undefined,
	};
}
