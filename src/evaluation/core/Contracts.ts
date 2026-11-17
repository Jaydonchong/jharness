export type EvaluationTask = {
	id: string;
	input: string;
	graders: EvaluationGrader[];
};

export type EvaluationSuite = {
	id: string;
	tasks: EvaluationTask[];
};

export type EvaluationTargetOutput = {
	text: string;
	structuredOutput?: unknown;
	metadata?: Record<string, unknown>;
	error?: string;
};

export interface EvaluationTarget {
	run(
		input: string,
		context: { suiteId: string; taskId: string },
	): Promise<EvaluationTargetOutput>;
}

export type GraderInput = {
	input: string;
	output: EvaluationTargetOutput;
};

export type GraderOutcome = {
	passed: boolean;
	score: number;
	details?: Record<string, unknown>;
};

export interface EvaluationGrader {
	id: string;
	grade(input: GraderInput): Promise<GraderOutcome>;
}

export type EvaluationTrial = {
	suiteRunId: string;
	suiteId: string;
	taskId: string;
	passed: boolean;
	graderOutcomes: Record<string, GraderOutcome>;
	targetMetadata?: Record<string, unknown>;
	error?: string;
	evaluatedAt: Date;
};

export interface EvaluationTrialStore {
	save(trial: EvaluationTrial): Promise<void>;
}

export type EvaluationSuiteRun = {
	suiteRunId: string;
	suiteId: string;
	passed: boolean;
	trials: EvaluationTrial[];
};
