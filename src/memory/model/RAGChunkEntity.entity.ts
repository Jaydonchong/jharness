import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RAGChunkLocation = {
	startOffset: number;
	endOffset: number;
	page?: number;
	sectionPath?: string[];
};

export type RAGChunkingDetails = {
	strategy: string;
	version: string;
	configHash?: string;
};

@Entity({ name: 'rag_chunks' })
@Index('IDX_rag_chunks_document_id', ['documentId'])
export class RAGChunkEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'document_id', type: 'uuid' })
	documentId!: string;

	@Column({ type: 'text' })
	content!: string;

	@Column({ type: 'integer' })
	ordinal!: number;

	@Column({ type: 'jsonb', nullable: true })
	location!: RAGChunkLocation | null;

	@Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
	metadata!: Record<string, unknown>;

	@Column({ type: 'jsonb' })
	chunking!: RAGChunkingDetails;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}
