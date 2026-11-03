import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { RAGChunkEntity } from './RAGChunkEntity.entity';

@Entity({ name: 'rag_chunk_embeddings' })
@Index('UQ_rag_chunk_embeddings_chunk_model', ['chunk', 'modelKey'], { unique: true })
export class RAGChunkEmbeddingEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => RAGChunkEntity, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'chunk_id', referencedColumnName: 'id' })
	chunk!: RAGChunkEntity;

	@Column({ name: 'model_key', type: 'varchar', length: 255 })
	modelKey!: string;

	@Column('vector')
	embedding!: number[];

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}
