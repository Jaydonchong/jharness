import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvaluationCaseResults1793946900000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "evaluation_case_results" (
				"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				"run_id" uuid NOT NULL,
				"suite_id" varchar(255) NOT NULL,
				"case_id" varchar(255) NOT NULL,
				"passed" boolean NOT NULL,
				"grader_results" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"target_metadata" jsonb,
				"error" text,
				"evaluated_at" timestamptz NOT NULL,
				"created_at" timestamptz NOT NULL DEFAULT now()
			)
		`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX "UQ_evaluation_case_results_run_case"
			ON "evaluation_case_results" ("run_id", "case_id")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('DROP TABLE "evaluation_case_results"');
	}
}
