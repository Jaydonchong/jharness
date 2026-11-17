import type { EvaluationSuite } from '@evaluation/EvaluationModule';
import { ResponsePresentGrader } from '@evaluation/graders/ResponsePresentGrader';
import { ToolCallExpectationGrader } from '@evaluation/graders/ToolCallExpectationGrader';

export const gcalSummarizerSmokeSuite: EvaluationSuite = {
	id: 'gcal-summarizer-smoke',
	tasks: [
		{
			id: 'summarize-calendar-day',
			input: 'List my calendar events for November 12, 2026.',
			graders: [
				new ResponsePresentGrader(),
				new ToolCallExpectationGrader({
					id: 'gcal-tool-called',
					toolName: 'gcal_list_events',
					expected: 'called',
				}),
			],
		},
	],
};
