export type EvaluationCase = {
	id: string;
	input: string;
	graderIds: string[];
};

export type EvaluationSuite = {
	id: string;
	cases: EvaluationCase[];
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
		context: { suiteId: string; caseId: string },
	): Promise<EvaluationTargetOutput>;
}

export type GraderInput = {
	input: string;
	output: EvaluationTargetOutput;
};

export type GraderResult = {
	passed: boolean;
	score: number;
	details?: Record<string, unknown>;
};

export interface EvaluationGrader {
	id: string;
	grade(input: GraderInput): Promise<GraderResult>;
}

export type EvaluationCaseResult = {
	runId: string;
	suiteId: string;
	caseId: string;
	passed: boolean;
	graderResults: Record<string, GraderResult>;
	targetMetadata?: Record<string, unknown>;
	error?: string;
	evaluatedAt: Date;
};

export interface EvaluationResultStore {
	save(result: EvaluationCaseResult): Promise<void>;
}

export type EvaluationRun = {
	runId: string;
	suiteId: string;
	passed: boolean;
	caseResults: EvaluationCaseResult[];
};
