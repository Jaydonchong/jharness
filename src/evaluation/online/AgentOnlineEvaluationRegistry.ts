import type { LanguageModel } from 'ai';
import type { ILlmProvider } from '@providers/Interfaces';
import { LlmJudgeGrader } from '@evaluation/graders/LlmJudgeGrader';
import { ResponsePresentGrader } from '@evaluation/graders/ResponsePresentGrader';
import type { AgentOnlineEvaluationRegistry } from './Contracts';

const ANSWER_QUALITY_RUBRIC = `
Evaluate these criteria:
1. Relevance: Does the answer directly address the user's request?
2. Completeness: Does the answer cover the important parts of the request without a material omission?
3. Clarity and usefulness: Is the answer understandable and useful for the user's stated goal?
4. Support: Does the answer avoid presenting claims as established when the supplied context does not support them?

Score 1 only when all criteria are met. Score 0.5 when the answer is useful but has a material gap. Score 0 when it misses the request or has a material error.
Judge factual correctness only when the supplied information supports checking it. Do not treat fluency or confidence as evidence of correctness.
`;

export function createAgentOnlineEvaluationRegistry(
	provider: ILlmProvider<LanguageModel>,
	model: LanguageModel,
): AgentOnlineEvaluationRegistry {
	const profile = {
		id: 'online-answer-quality',
		graders: [
			new ResponsePresentGrader(),
			new LlmJudgeGrader({
				id: 'answer-quality',
				rubric: ANSWER_QUALITY_RUBRIC,
				provider,
				model,
			}),
		],
	};

	return {
		'gcal-summarizer': profile,
		'system-design': profile,
	};
}
