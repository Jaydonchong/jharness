import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRagChunkSearchVector1793946700000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "rag_chunks"
			ADD COLUMN "search_vector" tsvector
			GENERATED ALWAYS AS (to_tsvector('english'::regconfig, "content")) STORED
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_rag_chunks_search_vector"
			ON "rag_chunks" USING GIN ("search_vector")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('DROP INDEX "IDX_rag_chunks_search_vector"');
		await queryRunner.query('ALTER TABLE "rag_chunks" DROP COLUMN "search_vector"');
	}
}
