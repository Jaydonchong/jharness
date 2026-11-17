import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameEvaluationCasesToTasksAndTrials1793947000000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'ALTER TABLE "evaluation_case_results" RENAME TO "evaluation_trials"',
		);
		await queryRunner.query(
			'ALTER TABLE "evaluation_trials" RENAME COLUMN "run_id" TO "suite_run_id"',
		);
		await queryRunner.query(
			'ALTER TABLE "evaluation_trials" RENAME COLUMN "case_id" TO "task_id"',
		);
		await queryRunner.query(
			'ALTER TABLE "evaluation_trials" RENAME COLUMN "grader_results" TO "grader_outcomes"',
		);
		await queryRunner.query(
			'ALTER INDEX "UQ_evaluation_case_results_run_case" RENAME TO "UQ_evaluation_trials_suite_run_task"',
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'ALTER INDEX "UQ_evaluation_trials_suite_run_task" RENAME TO "UQ_evaluation_case_results_run_case"',
		);
		await queryRunner.query(
			'ALTER TABLE "evaluation_trials" RENAME COLUMN "grader_outcomes" TO "grader_results"',
		);
		await queryRunner.query(
			'ALTER TABLE "evaluation_trials" RENAME COLUMN "task_id" TO "case_id"',
		);
		await queryRunner.query(
			'ALTER TABLE "evaluation_trials" RENAME COLUMN "suite_run_id" TO "run_id"',
		);
		await queryRunner.query(
			'ALTER TABLE "evaluation_trials" RENAME TO "evaluation_case_results"',
		);
	}
}
