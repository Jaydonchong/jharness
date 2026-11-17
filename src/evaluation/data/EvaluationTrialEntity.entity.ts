import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'evaluation_trials' })
@Index('UQ_evaluation_trials_suite_run_task', ['suiteRunId', 'taskId'], { unique: true })
export class EvaluationTrialEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'suite_run_id', type: 'uuid' })
	suiteRunId!: string;

	@Column({ name: 'suite_id', type: 'varchar', length: 255 })
	suiteId!: string;

	@Column({ name: 'task_id', type: 'varchar', length: 255 })
	taskId!: string;

	@Column({ type: 'boolean' })
	passed!: boolean;

	@Column({ name: 'grader_outcomes', type: 'jsonb', default: () => "'{}'::jsonb" })
	graderOutcomes!: Record<string, unknown>;

	@Column({ name: 'target_metadata', type: 'jsonb', nullable: true })
	targetMetadata!: Record<string, unknown> | null;

	@Column({ type: 'text', nullable: true })
	error!: string | null;

	@Column({ name: 'evaluated_at', type: 'timestamptz' })
	evaluatedAt!: Date;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}
