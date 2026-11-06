import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { RAGDocument } from '../model/RAGDocument';
import { RAGDocumentEntity } from './RAGDocumentEntity.entity';

export class RAGDocumentRepository {
	public async store(document: RAGDocument, manager?: EntityManager): Promise<RAGDocument> {
		const savedEntity = await this.getRepository(manager).save(RAGDocument.toEntity(document));
		return RAGDocument.fromEntity(savedEntity);
	}

	public async findById(id: string): Promise<RAGDocument | null> {
		const entity = await this.getRepository().findOneBy({ id });
		return entity ? RAGDocument.fromEntity(entity) : null;
	}

	private getRepository(manager?: EntityManager) {
		return manager
			? manager.getRepository(RAGDocumentEntity)
			: AppDataSource.getRepository(RAGDocumentEntity);
	}
}
