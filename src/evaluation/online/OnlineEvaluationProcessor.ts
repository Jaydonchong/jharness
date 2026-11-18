import type {
	EvaluationTrial,
	EvaluationTrialStore,
	GraderOutcome,
} from '@evaluation/core/Contracts';
import { EvaluationMetrics } from '@evaluation/core/EvaluationMetrics';
import type {
	AgentOnlineEvaluationRegistry,
	EvaluationTraceReader,
	OnlineEvaluationMessage,
} from './Contracts';
import logger from '@utils/Logger';
import { getTracer } from '@telemetry/Telemetry';

export type OnlineEvaluationProcessorDeps = {
	registry: AgentOnlineEvaluationRegistry;
	traceReader: EvaluationTraceReader;
	trialStore: EvaluationTrialStore;
	metrics: EvaluationMetrics;
};

export class OnlineEvaluationProcessor {
	public constructor(private readonly deps: OnlineEvaluationProcessorDeps) {}

	public async evaluate(message: OnlineEvaluationMessage): Promise<void> {
		if (Number(message.schemaVersion) !== 2) {
			throw new Error(
				`Unsupported online evaluation message version: ${message.schemaVersion}`,
			);
		}
		const profile = this.deps.registry[message.agentName];
		return getTracer('evaluation').startActiveSpan(
			'evaluation.trial.run',
			async (span) => {
				if (!profile) {
					logger.warn('No online evaluation profile registered for agent', {
						agentName: message.agentName,
						sessionId: message.sessionId,
					});
					span.setAttribute('evaluation.trial.status', 'unregistered');
					return;
				}

				if (await this.deps.trialStore.hasTrial(message.sessionId, profile.id)) {
					span.setAttribute('evaluation.trial.status', 'duplicate');
					return;
				}

				const traceData = await this.deps.traceReader.read(message);
				span.setAttribute('evaluation.trial.trace.id', message.traceId);
				span.setAttribute('evaluation.grader.count', profile.graders.length);
				const graderOutcomes: Record<string, GraderOutcome> = {};
				for (const grader of profile.graders) {
					const outcome = await grader.grade(traceData);
					graderOutcomes[grader.id] = outcome;
					span.setAttribute(`evaluation.grader.${grader.id}.passed`, outcome.passed);
					span.setAttribute(`evaluation.grader.${grader.id}.score`, outcome.score);
				}

				const trial: EvaluationTrial = {
					suiteRunId: message.sessionId,
					suiteId: profile.id,
					taskId: profile.id,
					passed: Object.values(graderOutcomes).every((outcome) => outcome.passed),
					graderOutcomes,
					targetMetadata: {
						agentName: message.agentName,
						traceId: message.traceId,
						toolCalls: traceData.output.metadata.toolCalls,
						completedAt: traceData.completedAt,
					},
					evaluatedAt: new Date(),
				};

				await this.deps.trialStore.save(trial);
				const metricContext = {
					mode: 'online' as const,
					evaluationName: profile.id,
					agentName: message.agentName,
				};
				this.deps.metrics.recordTrial(metricContext, trial.passed);
				for (const [graderId, outcome] of Object.entries(graderOutcomes)) {
					this.deps.metrics.recordScore(metricContext, graderId, outcome.score);
				}
				span.setAttribute('evaluation.trial.passed', trial.passed);
				span.setAttribute('evaluation.trial.status', trial.passed ? 'passed' : 'failed');
			},
			{
				attributes: {
					'evaluation.mode': 'online',
					'evaluation.name': profile?.id ?? 'unregistered',
					'evaluation.session.id': message.sessionId,
					'gen_ai.agent.name': message.agentName,
				},
			},
		);
	}
}
