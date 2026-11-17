import type { EvaluationSuite } from '../EvaluationModule';
import { ResponsePresentGrader } from '../graders/ResponsePresentGrader';
import { ToolCallExpectationGrader } from '../graders/ToolCallExpectationGrader';

export const gcalSummarizerSmokeSuite: EvaluationSuite = {
	id: 'gcal-summarizer-smoke',
	graders: [
		new ResponsePresentGrader(),
		new ToolCallExpectationGrader({
			id: 'gcal-tool-called',
			toolName: 'gcal_list_events',
			expected: 'called',
		}),
	],
	cases: [
		{
			id: 'summarize-calendar-day',
			input: 'List my calendar events for November 12, 2026.',
			graderIds: ['response-present', 'gcal-tool-called'],
		},
	],
};
