import { RAGChunk } from '../domain/RAGChunk';
import { RAGChunkEntity } from '../model/RAGChunkEntity.entity';
import { RAGDocumentEntity } from '../model/RAGDocumentEntity.entity';

export function toRAGChunkEntity(chunk: RAGChunk): RAGChunkEntity {
	const entity = new RAGChunkEntity();
	const documentReference = new RAGDocumentEntity();
	documentReference.id = chunk.documentId;

	entity.id = chunk.id;
	entity.document = documentReference;
	entity.content = chunk.content;
	entity.ordinal = chunk.ordinal;
	entity.location = chunk.location;
	entity.documentChunkMetadata = chunk.documentChunkMetadata;
	entity.chunkingMetadata = chunk.chunkingMetadata;
	entity.createdAt = chunk.createdAt;
	return entity;
}

export function toRAGChunkDomain(entity: RAGChunkEntity): RAGChunk {
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
