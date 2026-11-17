import type { RAGChunkEntity } from '@memory/data/RAGChunkEntity.entity';
import type { RAGDocumentEntity } from '@memory/data/RAGDocumentEntity.entity';
import type { ChunkLocation, ChunkingMetadata } from '@utils/chunking/ChunkingTypes';

export type RAGChunkLocation = ChunkLocation;
export type RAGChunkingMetadata = ChunkingMetadata;

export type RAGChunkProps = {
	id: string;
	documentId: string;
	content: string;
	ordinal: number;
	location: RAGChunkLocation | null;
	documentChunkMetadata: Record<string, unknown>;
	chunkingMetadata: RAGChunkingMetadata;
	createdAt: Date;
};

const MAX_ORDINAL = 2_147_483_647;

export class RAGChunk {
	public readonly id: string;
	public readonly documentId: string;
	public readonly content: string;
	public readonly ordinal: number;
	public readonly location: RAGChunkLocation | null;
	public readonly documentChunkMetadata: Record<string, unknown>;
	public readonly chunkingMetadata: RAGChunkingMetadata;
	public readonly createdAt: Date;

	public static fromEntity(entity: RAGChunkEntity): RAGChunk {
		return new RAGChunk({
			id: entity.id,
			documentId: entity.documentId,
			content: entity.content,
			ordinal: entity.ordinal,
			location: entity.location,
			documentChunkMetadata: entity.documentChunkMetadata,
			chunkingMetadata: entity.chunkingMetadata,
			createdAt: entity.createdAt,
		});
	}

	public static toEntity(chunk: RAGChunk): RAGChunkEntity {
		return {
			id: chunk.id,
			document: { id: chunk.documentId } as unknown as RAGDocumentEntity,
			content: chunk.content,
			ordinal: chunk.ordinal,
			location: chunk.location,
			documentChunkMetadata: chunk.documentChunkMetadata,
			chunkingMetadata: chunk.chunkingMetadata,
			createdAt: chunk.createdAt,
		} as RAGChunkEntity;
	}

	public constructor(props: RAGChunkProps) {
		if (!props.id.trim() || !props.documentId.trim()) {
			throw new TypeError('RAGChunk id and documentId must not be empty.');
		}

		if (!props.content.trim()) {
			throw new TypeError('RAGChunk content must not be empty.');
		}

		if (!Number.isInteger(props.ordinal) || props.ordinal < 0 || props.ordinal > MAX_ORDINAL) {
			throw new RangeError('RAGChunk ordinal must fit a non-negative integer column.');
		}

		if (
			props.location &&
			(!Number.isInteger(props.location.startOffset) ||
				!Number.isInteger(props.location.endOffset) ||
				props.location.startOffset < 0 ||
				props.location.endOffset < props.location.startOffset)
		) {
			throw new RangeError('RAGChunk location offsets must be valid and ordered.');
		}

		if (Number.isNaN(props.createdAt.getTime())) {
			throw new RangeError('RAGChunk createdAt must be a valid date.');
		}

		if (!props.chunkingMetadata.strategy.trim() || !props.chunkingMetadata.version.trim()) {
			throw new TypeError('RAGChunk strategy and version must not be empty.');
		}

		this.id = props.id;
		this.documentId = props.documentId;
		this.content = props.content;
		this.ordinal = props.ordinal;
		this.location = props.location
			? { ...props.location, sectionPath: props.location.sectionPath?.slice() }
			: null;
		this.documentChunkMetadata = { ...props.documentChunkMetadata };
		this.chunkingMetadata = { ...props.chunkingMetadata };
		this.createdAt = new Date(props.createdAt);
	}
}
