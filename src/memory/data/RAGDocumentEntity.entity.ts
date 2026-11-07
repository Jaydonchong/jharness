import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'rag_documents' })
@Index('IDX_rag_documents_source_reference', ['sourceReference'])
@Index('UQ_rag_documents_deduplication_key', ['deduplicationKey'], { unique: true })
export class RAGDocumentEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'source_reference', type: 'text', nullable: true })
	sourceReference!: string | null;

	@Column({ type: 'varchar', length: 500, nullable: true })
	title!: string | null;

	@Column({ name: 'content_hash', type: 'varchar', length: 128, nullable: true })
	contentHash!: string | null;

	@Column({ name: 'deduplication_key', type: 'varchar', length: 64, nullable: true })
	deduplicationKey!: string | null;

	@Column({ name: 'document_metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
	documentMetadata!: Record<string, unknown>;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}
