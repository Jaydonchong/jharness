import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '@database/data-source';
import { MEMORY_TYPE, type MemoryRetrievalContext } from '@memory/core/Interfaces';
import { RAGChunk } from '@memory/model/RAGChunk';
import { RAGChunkEntity } from './RAGChunkEntity.entity';
import { RAGChunkEmbeddingEntity } from './RAGChunkEmbeddingEntity.entity';

export class RAGChunkRepository {
	public async store(
		chunk: RAGChunk,
		embedding: number[],
		modelKey: string,
		manager?: EntityManager,
	): Promise<RAGChunk> {
		const savedEntity = await this.getChunkRepository(manager).save(RAGChunk.toEntity(chunk));
		await this.getEmbeddingRepository(manager).save({
			chunk: savedEntity,
			modelKey,
			embedding,
		} as RAGChunkEmbeddingEntity);
		return RAGChunk.fromEntity(savedEntity);
	}

	public async findById(id: string): Promise<RAGChunk | null> {
		const entity = await this.getChunkRepository().findOneBy({ id });
		return entity ? RAGChunk.fromEntity(entity) : null;
	}

	public async findDotProductSimilar(
		embedding: number[],
		modelKey: string,
		limit: number,
		filters?: MemoryRetrievalContext['filters'],
	): Promise<RAGChunk[]> {
		const types = filters?.types ?? [MEMORY_TYPE.FACT];
		if (types.length === 0) {
			return [];
		}

		const vector = `[${embedding.join(',')}]`;
		// pgvector returns the negative inner product, so ascending order ranks the highest dot products first.
		const query = this.getChunkRepository()
			.createQueryBuilder('chunk')
			.innerJoin(
				RAGChunkEmbeddingEntity,
				'embedding',
				'embedding.chunk_id = chunk.id AND embedding.model_key = :modelKey',
				{ modelKey },
			)
			.orderBy('embedding.embedding <#> CAST(:vector AS vector)', 'ASC')
			.setParameter('vector', vector);
		this.applyRetrievalFilters(query, filters);

		const entities = await query.limit(limit).getMany();

		return entities.map(RAGChunk.fromEntity);
	}

	public async findLexical(
		searchText: string,
		limit: number,
		filters?: MemoryRetrievalContext['filters'],
	): Promise<RAGChunk[]> {
		const types = filters?.types ?? [MEMORY_TYPE.FACT];
		if (types.length === 0) {
			return [];
		}

		const query = this.getChunkRepository()
			.createQueryBuilder('chunk')
			.where("chunk.search_vector @@ websearch_to_tsquery('english', :searchText)", {
				searchText,
			});
		this.applyRetrievalFilters(query, filters);

		const rank =
			"ts_rank_cd(chunk.search_vector, websearch_to_tsquery('english', :searchText))";
		const entities = await query
			.orderBy(rank, 'DESC')
			.addOrderBy('chunk.createdAt', 'DESC')
			.take(limit)
			.getMany();

		return entities.map(RAGChunk.fromEntity);
	}

	private applyRetrievalFilters(
		query: SelectQueryBuilder<RAGChunkEntity>,
		filters?: MemoryRetrievalContext['filters'],
	): void {
		const types = filters?.types ?? [MEMORY_TYPE.FACT];
		query.andWhere("chunk.document_chunk_metadata ->> 'type' IN (:...types)", { types });

		if (filters?.tags?.length) {
			query.andWhere("chunk.document_chunk_metadata -> 'tags' @> CAST(:tags AS jsonb)", {
				tags: JSON.stringify(filters.tags),
			});
		}

		const createdAt =
			"COALESCE((chunk.document_chunk_metadata ->> 'created')::timestamptz, chunk.created_at)";
		if (filters?.from) {
			query.andWhere(`${createdAt} >= :from`, { from: filters.from });
		}
		if (filters?.to) {
			query.andWhere(`${createdAt} <= :to`, { to: filters.to });
		}
	}

	private getChunkRepository(manager?: EntityManager) {
		return manager
			? manager.getRepository(RAGChunkEntity)
			: AppDataSource.getRepository(RAGChunkEntity);
	}

	private getEmbeddingRepository(manager?: EntityManager) {
		return manager
			? manager.getRepository(RAGChunkEmbeddingEntity)
			: AppDataSource.getRepository(RAGChunkEmbeddingEntity);
	}
}
