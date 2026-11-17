import { randomUUID } from 'node:crypto';
import type {
	EvaluationTrial,
	EvaluationTrialStore,
	EvaluationSuiteRun,
	EvaluationSuite,
	EvaluationTarget,
	GraderOutcome,
} from './Contracts';
import { getMeter, getTracer } from '@telemetry/Telemetry';

export type EvaluationHarnessDeps = {
	target: EvaluationTarget;
	trialStore: EvaluationTrialStore;
};

export class EvaluationHarness {
	private readonly meter = getMeter('evaluation');
	private readonly trialCounter = this.meter.createCounter('evaluation.trials.count', {
		description: 'Number of completed evaluation trials',
		unit: '1',
	});
	private readonly scoreHistogram = this.meter.createHistogram('evaluation.score', {
		description: 'Scores assigned by evaluation graders',
		unit: '1',
	});

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
		return getTracer('evaluation').startActiveSpan(
			'evaluation.suite.run',
			async (span) => {
				span.setAttribute('test.suite.run.status', 'in_progress');
				const trials: EvaluationTrial[] = [];

				try {
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
								Object.values(graderOutcomes).every(
									(graderOutcome) => graderOutcome.passed,
								),
							graderOutcomes,
							targetMetadata,
							error,
							evaluatedAt,
						};

						await this.deps.trialStore.save(trial);
						this.trialCounter.add(1, {
							'evaluation.suite.id': suite.id,
							'test.case.result.status': trial.passed ? 'pass' : 'fail',
						});
						for (const [graderId, outcome] of Object.entries(graderOutcomes)) {
							this.scoreHistogram.record(outcome.score, {
								'evaluation.suite.id': suite.id,
								'evaluation.grader.id': graderId,
							});
						}
						trials.push(trial);
					}

					const run = {
						suiteRunId,
						suiteId: suite.id,
						passed: trials.every((trial) => trial.passed),
						trials,
					};
					span.setAttribute('test.suite.run.status', run.passed ? 'success' : 'failure');
					return run;
				} catch (error) {
					span.setAttribute('test.suite.run.status', 'aborted');
					throw error;
				}
			},
			{
				attributes: {
					'evaluation.mode': 'offline',
					'evaluation.suite.id': suite.id,
					'evaluation.suite.run.id': suiteRunId,
					'test.suite.name': suite.id,
				},
			},
		);
	}
}
