import { RAGDocument } from '../domain/RAGDocument';
import { RAGDocumentEntity } from '../model/RAGDocumentEntity.entity';

export function toRAGDocumentEntity(document: RAGDocument): RAGDocumentEntity {
	const entity = new RAGDocumentEntity();
	entity.id = document.id;
	entity.sourceReference = document.sourceReference;
	entity.title = document.title;
	entity.contentHash = document.contentHash;
	entity.documentMetadata = document.documentMetadata;
	entity.createdAt = document.createdAt;
	entity.updatedAt = document.updatedAt;
	return entity;
}

export function toRAGDocumentDomain(entity: RAGDocumentEntity): RAGDocument {
	return new RAGDocument({
		id: entity.id,
		sourceReference: entity.sourceReference,
		title: entity.title,
		contentHash: entity.contentHash,
		documentMetadata: entity.documentMetadata,
		createdAt: entity.createdAt,
		updatedAt: entity.updatedAt,
	});
}
