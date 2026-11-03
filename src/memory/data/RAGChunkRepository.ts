import type { Repository } from 'typeorm';
import { RAGChunk } from '../model/RAGChunk';
import { RAGChunkEntity } from './RAGChunkEntity.entity';

export class RAGChunkRepository {
	public constructor(private readonly repository: Repository<RAGChunkEntity>) {}

	public async store(chunk: RAGChunk): Promise<RAGChunk> {
		const savedEntity = await this.repository.save(RAGChunk.toEntity(chunk));
		return RAGChunk.fromEntity(savedEntity);
	}

	public async findById(id: string): Promise<RAGChunk | null> {
		const entity = await this.repository.findOneBy({ id });
		return entity ? RAGChunk.fromEntity(entity) : null;
	}
}
