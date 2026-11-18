import { getMeter } from '@telemetry/Telemetry';

export type EvaluationMode = 'offline' | 'online';

export type EvaluationMetricContext = {
	mode: EvaluationMode;
	evaluationName: string;
	agentName?: string;
};

export class EvaluationMetrics {
	private readonly meter = getMeter('evaluation');
	private readonly trialCounter = this.meter.createCounter('evaluation.trials.count', {
		description: 'Number of completed evaluation trials',
		unit: '1',
	});
	private readonly scoreHistogram = this.meter.createHistogram('evaluation.score', {
		description: 'Scores assigned by evaluation graders',
		unit: '1',
	});

	public recordTrial(context: EvaluationMetricContext, passed: boolean): void {
		this.trialCounter.add(1, {
			'evaluation.mode': context.mode,
			'evaluation.name': context.evaluationName,
			...(context.agentName ? { 'gen_ai.agent.name': context.agentName } : {}),
			'test.case.result.status': passed ? 'pass' : 'fail',
		});
	}

	public recordScore(context: EvaluationMetricContext, graderId: string, score: number): void {
		this.scoreHistogram.record(score, {
			'evaluation.mode': context.mode,
			'evaluation.name': context.evaluationName,
			'evaluation.grader.id': graderId,
			...(context.agentName ? { 'gen_ai.agent.name': context.agentName } : {}),
		});
	}
}
