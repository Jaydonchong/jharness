import type { EvaluationSuite } from '@evaluation/EvaluationModule';
import { ResponsePresentGrader } from '@evaluation/graders/ResponsePresentGrader';
import { ToolCallExpectationGrader } from '@evaluation/graders/ToolCallExpectationGrader';

export const systemDesignSmokeSuite: EvaluationSuite = {
	id: 'system-design-smoke',
	graders: [
		new ResponsePresentGrader(),
		new ToolCallExpectationGrader({
			id: 'recall-tool-called',
			toolName: 'recall',
			expected: 'called',
		}),
		new ToolCallExpectationGrader({
			id: 'web-search-not-called',
			toolName: 'web_search',
			expected: 'not-called',
		}),
	],
	cases: [
		{
			id: 'explain-acid-from-corpus',
			input: 'What is ACID in relational databases?',
			graderIds: ['response-present', 'recall-tool-called', 'web-search-not-called'],
		},
	],
};
