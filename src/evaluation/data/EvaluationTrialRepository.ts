import type { Repository } from 'typeorm';
import type { EvaluationTrial, EvaluationTrialStore } from '@evaluation/core/Contracts';
import { EvaluationTrialEntity } from './EvaluationTrialEntity.entity';

export class EvaluationTrialRepository implements EvaluationTrialStore {
	public constructor(private readonly repository: Repository<EvaluationTrialEntity>) {}

	public async hasTrial(suiteRunId: string, taskId: string): Promise<boolean> {
		return (await this.repository.findOneBy({ suiteRunId, taskId })) !== null;
	}

	public async save(trial: EvaluationTrial): Promise<void> {
		await this.repository.save({
			suiteRunId: trial.suiteRunId,
			suiteId: trial.suiteId,
			taskId: trial.taskId,
			passed: trial.passed,
			graderOutcomes: trial.graderOutcomes,
			targetMetadata: trial.targetMetadata ?? null,
			error: trial.error ?? null,
			evaluatedAt: trial.evaluatedAt,
		});
	}
}
