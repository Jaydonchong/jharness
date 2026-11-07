import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRagDocumentDeduplicationKey1793946800000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "rag_documents"
			ADD COLUMN "deduplication_key" varchar(64)
		`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX "UQ_rag_documents_deduplication_key"
			ON "rag_documents" ("deduplication_key")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('DROP INDEX "UQ_rag_documents_deduplication_key"');
		await queryRunner.query('ALTER TABLE "rag_documents" DROP COLUMN "deduplication_key"');
	}
}
