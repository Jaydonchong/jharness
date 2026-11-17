import { randomUUID } from 'node:crypto';
import type {
	EvaluationTrial,
	EvaluationTrialStore,
	EvaluationSuiteRun,
	EvaluationSuite,
	EvaluationTarget,
	GraderOutcome,
} from './Contracts';

export type EvaluationHarnessDeps = {
	target: EvaluationTarget;
	trialStore: EvaluationTrialStore;
};

export class EvaluationHarness {
	public constructor(private readonly deps: EvaluationHarnessDeps) {}

	public async runSuite(suite: EvaluationSuite): Promise<EvaluationSuiteRun> {
		if (suite.tasks.length === 0) throw new Error(`Evaluation suite has no tasks: ${suite.id}`);
		const taskIds = new Set<string>();
		for (const task of suite.tasks) {
			if (taskIds.has(task.id)) {
				throw new Error(`Duplicate evaluation task ID: ${task.id}`);
			}
			taskIds.add(task.id);
			if (task.graders.length === 0) {
				throw new Error(`Evaluation task has no graders: ${task.id}`);
			}
			const graderIds = new Set(task.graders.map((grader) => grader.id));
			if (graderIds.size !== task.graders.length) {
				throw new Error(`Evaluation grader IDs must be unique in task: ${task.id}`);
			}
		}

		const suiteRunId = randomUUID();
		const trials: EvaluationTrial[] = [];

		for (const task of suite.tasks) {
			const evaluatedAt = new Date();
			const graderOutcomes: Record<string, GraderOutcome> = {};
			let targetMetadata: Record<string, unknown> | undefined;
			let error: string | undefined;

			try {
				const output = await this.deps.target.run(task.input, {
					suiteId: suite.id,
					taskId: task.id,
				});
				targetMetadata = output.metadata;
				error = output.error;

				for (const grader of task.graders) {
					graderOutcomes[grader.id] = await grader.grade({
						input: task.input,
						output,
					});
				}
			} catch (cause) {
				error = cause instanceof Error ? cause.message : String(cause);
			}

			const trial = {
				suiteRunId,
				suiteId: suite.id,
				taskId: task.id,
				passed:
					error === undefined &&
					Object.values(graderOutcomes).every((graderOutcome) => graderOutcome.passed),
				graderOutcomes,
				targetMetadata,
				error,
				evaluatedAt,
			};

			await this.deps.trialStore.save(trial);
			trials.push(trial);
		}

		return {
			suiteRunId,
			suiteId: suite.id,
			passed: trials.every((trial) => trial.passed),
			trials,
		};
	}
}
