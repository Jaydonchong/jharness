import type { EvaluationGrader } from '../core/Contracts';

export type ToolCallExpectation = {
	id: string;
	toolName: string;
	expected: 'called' | 'not-called';
};

export class ToolCallExpectationGrader implements EvaluationGrader {
	public readonly id: string;

	public constructor(private readonly expectation: ToolCallExpectation) {
		this.id = expectation.id;
	}

	public async grade({ output }: Parameters<EvaluationGrader['grade']>[0]) {
		const recordedToolCalls = output.metadata?.toolCalls;
		const toolCalls = Array.isArray(recordedToolCalls)
			? recordedToolCalls.filter(
					(toolName): toolName is string => typeof toolName === 'string',
				)
			: [];
		const called = toolCalls.includes(this.expectation.toolName);
		const passed = this.expectation.expected === 'called' ? called : !called;

		return {
			passed,
			score: passed ? 1 : 0,
			details: {
				toolName: this.expectation.toolName,
				expected: this.expectation.expected,
				called,
				toolCalls,
			},
		};
	}
}
