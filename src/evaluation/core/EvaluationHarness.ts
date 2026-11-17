import { randomUUID } from 'node:crypto';
import type {
	EvaluationCaseResult,
	EvaluationResultStore,
	EvaluationRun,
	EvaluationSuite,
	EvaluationTarget,
	GraderResult,
} from './Contracts';

export type EvaluationHarnessDeps = {
	target: EvaluationTarget;
	resultStore: EvaluationResultStore;
};

export class EvaluationHarness {
	public constructor(private readonly deps: EvaluationHarnessDeps) {}

	public async runSuite(suite: EvaluationSuite): Promise<EvaluationRun> {
		if (suite.cases.length === 0) throw new Error(`Evaluation suite has no cases: ${suite.id}`);
		const graders = new Map(suite.graders.map((grader) => [grader.id, grader]));
		if (graders.size !== suite.graders.length) {
			throw new Error(`Evaluation grader IDs must be unique in suite: ${suite.id}`);
		}

		const caseIds = new Set<string>();
		for (const evaluationCase of suite.cases) {
			if (caseIds.has(evaluationCase.id)) {
				throw new Error(`Duplicate evaluation case ID: ${evaluationCase.id}`);
			}
			caseIds.add(evaluationCase.id);
			if (evaluationCase.graderIds.length === 0) {
				throw new Error(`Evaluation case has no graders: ${evaluationCase.id}`);
			}
			for (const graderId of evaluationCase.graderIds) {
				if (!graders.has(graderId)) {
					throw new Error(`Unknown evaluation grader: ${graderId}`);
				}
			}
		}

		const runId = randomUUID();
		const caseResults: EvaluationCaseResult[] = [];

		for (const evaluationCase of suite.cases) {
			const evaluatedAt = new Date();
			const graderResults: Record<string, GraderResult> = {};
			let targetMetadata: Record<string, unknown> | undefined;
			let error: string | undefined;

			try {
				const output = await this.deps.target.run(evaluationCase.input, {
					suiteId: suite.id,
					caseId: evaluationCase.id,
				});
				targetMetadata = output.metadata;
				error = output.error;

				for (const graderId of evaluationCase.graderIds) {
					const grader = graders.get(graderId);
					if (!grader) throw new Error(`Unknown evaluation grader: ${graderId}`);
					graderResults[graderId] = await grader.grade({
						input: evaluationCase.input,
						output,
					});
				}
			} catch (cause) {
				error = cause instanceof Error ? cause.message : String(cause);
			}

			const result = {
				runId,
				suiteId: suite.id,
				caseId: evaluationCase.id,
				passed:
					error === undefined &&
					Object.values(graderResults).every((graderResult) => graderResult.passed),
				graderResults,
				targetMetadata,
				error,
				evaluatedAt,
			};

			await this.deps.resultStore.save(result);
			caseResults.push(result);
		}

		return {
			runId,
			suiteId: suite.id,
			passed: caseResults.every((result) => result.passed),
			caseResults,
		};
	}
}
