import type { EvaluationSuite } from '../EvaluationModule';

export const systemDesignSmokeSuite: EvaluationSuite = {
	id: 'system-design-smoke',
	cases: [
		{
			id: 'explain-acid-from-corpus',
			input: 'What is ACID in relational databases?',
			graderIds: ['response-present', 'recall-tool-called', 'web-search-not-called'],
		},
	],
};
