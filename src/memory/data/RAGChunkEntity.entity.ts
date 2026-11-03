import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	RelationId,
} from 'typeorm';
import { RAGDocumentEntity } from './RAGDocumentEntity.entity';
import type { RAGChunkLocation, RAGChunkingMetadata } from '../model/RAGChunk';

@Entity({ name: 'rag_chunks' })
@Index('IDX_rag_chunks_document_id', ['document'])
export class RAGChunkEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => RAGDocumentEntity, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'document_id', referencedColumnName: 'id' })
	document!: RAGDocumentEntity;

	@RelationId((chunk: RAGChunkEntity) => chunk.document)
	documentId!: string;

	@Column({ type: 'text' })
	content!: string;

	@Column({ type: 'integer' })
	ordinal!: number;

	@Column({ type: 'jsonb', nullable: true })
	location!: RAGChunkLocation | null;

	@Column({ name: 'document_chunk_metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
	documentChunkMetadata!: Record<string, unknown>;

	@Column({ name: 'chunking_metadata', type: 'jsonb' })
	chunkingMetadata!: RAGChunkingMetadata;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}
