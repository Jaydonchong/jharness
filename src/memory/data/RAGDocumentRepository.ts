import type { Repository } from 'typeorm';
import { RAGDocument } from '../model/RAGDocument';
import { RAGDocumentEntity } from './RAGDocumentEntity.entity';

export class RAGDocumentRepository {
	public constructor(private readonly repository: Repository<RAGDocumentEntity>) {}

	public async store(document: RAGDocument): Promise<RAGDocument> {
		const savedEntity = await this.repository.save(RAGDocument.toEntity(document));
		return RAGDocument.fromEntity(savedEntity);
	}

	public async findById(id: string): Promise<RAGDocument | null> {
		const entity = await this.repository.findOneBy({ id });
		return entity ? RAGDocument.fromEntity(entity) : null;
	}
}
