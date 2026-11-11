import { ResponsePresentGrader } from './ResponsePresentGrader';
import { ToolCallExpectationGrader } from './ToolCallExpectationGrader';

export function createEvaluationGraders() {
	return [
		new ResponsePresentGrader(),
		new ToolCallExpectationGrader({
			id: 'gcal-tool-called',
			toolName: 'gcal_list_events',
			expected: 'called',
		}),
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
	];
}
