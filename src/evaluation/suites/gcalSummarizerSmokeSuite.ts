import type { EvaluationSuite } from '../EvaluationModule';

export const gcalSummarizerSmokeSuite: EvaluationSuite = {
	id: 'gcal-summarizer-smoke',
	cases: [
		{
			id: 'summarize-calendar-day',
			input: 'List my calendar events for November 12, 2026.',
			graderIds: ['response-present', 'gcal-tool-called'],
		},
	],
};
