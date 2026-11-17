import type { EvaluationGrader } from '@evaluation/core/Contracts';

export class ResponsePresentGrader implements EvaluationGrader {
	public readonly id = 'response-present';

	public async grade({ output }: Parameters<EvaluationGrader['grade']>[0]) {
		const passed = output.text.trim().length > 0;
		return {
			passed,
			score: passed ? 1 : 0,
			details: { responseLength: output.text.length },
		};
	}
}
