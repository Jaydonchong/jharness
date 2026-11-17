import type { Repository } from 'typeorm';
import type { EvaluationCaseResult, EvaluationResultStore } from '@evaluation/core/Contracts';
import { EvaluationCaseResultEntity } from './EvaluationCaseResultEntity.entity';

export class TypeOrmEvaluationResultStore implements EvaluationResultStore {
	public constructor(private readonly repository: Repository<EvaluationCaseResultEntity>) {}

	public async save(result: EvaluationCaseResult): Promise<void> {
		await this.repository.save({
			runId: result.runId,
			suiteId: result.suiteId,
			caseId: result.caseId,
			passed: result.passed,
			graderResults: result.graderResults,
			targetMetadata: result.targetMetadata ?? null,
			error: result.error ?? null,
			evaluatedAt: result.evaluatedAt,
		});
	}
}
