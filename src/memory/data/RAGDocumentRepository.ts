import type { Repository } from 'typeorm';
import { RAGDocument } from '../domain/RAGDocument';
import { RAGDocumentEntity } from '../model/RAGDocumentEntity.entity';
import { toRAGDocumentDomain, toRAGDocumentEntity } from './RAGDocumentMapper';

export class RAGDocumentRepository {
	public constructor(private readonly repository: Repository<RAGDocumentEntity>) {}

	public async store(document: RAGDocument): Promise<RAGDocument> {
		const savedEntity = await this.repository.save(toRAGDocumentEntity(document));
		return toRAGDocumentDomain(savedEntity);
	}

	public async findById(id: string): Promise<RAGDocument | null> {
		const entity = await this.repository.findOneBy({ id });
		return entity ? toRAGDocumentDomain(entity) : null;
	}
}
