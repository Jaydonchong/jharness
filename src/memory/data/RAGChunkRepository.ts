import type { Repository } from 'typeorm';
import { RAGChunk } from '../domain/RAGChunk';
import { RAGChunkEntity } from '../model/RAGChunkEntity.entity';
import { toRAGChunkDomain, toRAGChunkEntity } from './RAGChunkMapper';

export class RAGChunkRepository {
	public constructor(private readonly repository: Repository<RAGChunkEntity>) {}

	public async store(chunk: RAGChunk): Promise<RAGChunk> {
		const savedEntity = await this.repository.save(toRAGChunkEntity(chunk));
		return toRAGChunkDomain(savedEntity);
	}

	public async findById(id: string): Promise<RAGChunk | null> {
		const entity = await this.repository.findOneBy({ id });
		return entity ? toRAGChunkDomain(entity) : null;
	}
}
