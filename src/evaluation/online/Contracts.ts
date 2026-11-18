import type { EvaluationGrader } from '../core/Contracts';

export type OnlineEvaluationMessage = {
	schemaVersion: 2;
	traceId: string;
	sessionId: string;
	agentName: string;
};

export type OnlineEvaluationTraceData = {
	input: string;
	output: {
		text: string;
		structuredOutput?: unknown;
		metadata: { toolCalls: string[] };
		error?: string;
	};
	completedAt: string;
};

export interface EvaluationTraceReader {
	read(message: OnlineEvaluationMessage): Promise<OnlineEvaluationTraceData>;
}

export type OnlineEvaluationProfile = {
	id: string;
	graders: readonly EvaluationGrader[];
};

export type AgentOnlineEvaluationRegistry = Record<string, OnlineEvaluationProfile>;

export interface OnlineEvaluationPublisher {
	enqueue(message: OnlineEvaluationMessage): Promise<void>;
}
