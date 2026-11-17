import type { EvaluationSuite } from './core/Contracts';
import { gcalSummarizerSmokeSuite } from './suites/gcalSummarizerSmokeSuite';
import { systemDesignSmokeSuite } from './suites/systemDesignSmokeSuite';

export const AgentSuiteRegistry: Record<string, EvaluationSuite[]> = {
	'gcal-summarizer': [gcalSummarizerSmokeSuite],
	'system-design': [systemDesignSmokeSuite],
};
