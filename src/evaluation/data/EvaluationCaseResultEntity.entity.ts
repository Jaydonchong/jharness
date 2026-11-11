import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'evaluation_case_results' })
@Index('UQ_evaluation_case_results_run_case', ['runId', 'caseId'], { unique: true })
export class EvaluationCaseResultEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'run_id', type: 'uuid' })
	runId!: string;

	@Column({ name: 'suite_id', type: 'varchar', length: 255 })
	suiteId!: string;

	@Column({ name: 'case_id', type: 'varchar', length: 255 })
	caseId!: string;

	@Column({ type: 'boolean' })
	passed!: boolean;

	@Column({ name: 'grader_results', type: 'jsonb', default: () => "'{}'::jsonb" })
	graderResults!: Record<string, unknown>;

	@Column({ name: 'target_metadata', type: 'jsonb', nullable: true })
	targetMetadata!: Record<string, unknown> | null;

	@Column({ type: 'text', nullable: true })
	error!: string | null;

	@Column({ name: 'evaluated_at', type: 'timestamptz' })
	evaluatedAt!: Date;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}
