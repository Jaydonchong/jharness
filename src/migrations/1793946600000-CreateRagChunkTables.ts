import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRagChunkTables1793946600000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
		await queryRunner.query(`
			CREATE TABLE "rag_documents" (
				"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				"source_reference" text,
				"title" varchar(500),
				"content_hash" varchar(128),
				"document_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"created_at" timestamptz NOT NULL DEFAULT now(),
				"updated_at" timestamptz NOT NULL DEFAULT now()
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_rag_documents_source_reference"
			ON "rag_documents" ("source_reference")
		`);
		await queryRunner.query(`
			CREATE TABLE "rag_chunks" (
				"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				"document_id" uuid NOT NULL,
				"content" text NOT NULL,
				"ordinal" integer NOT NULL,
				"location" jsonb,
				"document_chunk_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"chunking_metadata" jsonb NOT NULL,
				"created_at" timestamptz NOT NULL DEFAULT now(),
				CONSTRAINT "FK_rag_chunks_document_id"
					FOREIGN KEY ("document_id") REFERENCES "rag_documents"("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_rag_chunks_document_id"
			ON "rag_chunks" ("document_id")
		`);
		await queryRunner.query(`
			CREATE TABLE "rag_chunk_embeddings" (
				"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				"chunk_id" uuid NOT NULL,
				"model_key" varchar(255) NOT NULL,
				"embedding" vector NOT NULL,
				"created_at" timestamptz NOT NULL DEFAULT now(),
				CONSTRAINT "FK_rag_chunk_embeddings_chunk_id"
					FOREIGN KEY ("chunk_id") REFERENCES "rag_chunks"("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX "UQ_rag_chunk_embeddings_chunk_model"
			ON "rag_chunk_embeddings" ("chunk_id", "model_key")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('DROP TABLE "rag_chunk_embeddings"');
		await queryRunner.query('DROP TABLE "rag_chunks"');
		await queryRunner.query('DROP TABLE "rag_documents"');
	}
}
