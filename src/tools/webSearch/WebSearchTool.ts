import z from 'zod';
import { IWebSearchAdapter } from '@network/webSearch/Interfaces';
import { AgentTool } from '@tools/core/AgentTool';

export const WebSearchInputSchema = z.object({
	query: z.string().trim().min(1).max(300).describe('The web search query'),
	limit: z
		.number()
		.int()
		.min(1)
		.max(10)
		.optional()
		.describe('Maximum number of results (default 5)'),
});

export const WebSearchOutputSchema = z.object({
	results: z.array(
		z.object({
			rank: z.number().int(),
			engine: z.string(),
			title: z.string(),
			url: z.string().url(),
			snippet: z.string(),
		}),
	),
});

export class WebSearchTool extends AgentTool<
	typeof WebSearchInputSchema,
	typeof WebSearchOutputSchema
> {
	constructor(private readonly deps: { webSearchAdapter: IWebSearchAdapter }) {
		super({
			name: 'web_search',
			description:
				'Find current web pages relevant to a query. Returns ranked organic results with source URLs and snippets.',
			inputSchema: WebSearchInputSchema,
			outputSchema: WebSearchOutputSchema,
		});
	}

	protected async execute(input: z.infer<typeof WebSearchInputSchema>) {
		const results = await this.deps.webSearchAdapter.search({
			...input,
			query: input.query.trim(),
		});
		return { results };
	}
}
