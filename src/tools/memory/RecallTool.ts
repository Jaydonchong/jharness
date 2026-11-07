import z from 'zod';
import { ContextAssembler } from '../../memory/core/ContextAssembler';
import { MEMORY_TYPE, MemoryFragment } from '../../memory/core/Interfaces';
import { AgentTool } from '../core/AgentTool';

const SUPPORTED_MEMORY_TYPES = [
	MEMORY_TYPE.DECISION,
	MEMORY_TYPE.PREFERENCE,
	MEMORY_TYPE.SESSION_SUMMARY,
] as const;
const RECALLABLE_MEMORY_TYPES = [MEMORY_TYPE.FACT, ...SUPPORTED_MEMORY_TYPES] as const;
const MEMORY_FRAGMENT_TYPE_SCHEMA = z.enum(RECALLABLE_MEMORY_TYPES);

export const RecallToolInputSchema = z.object({
	query: z.string().describe('What the agent needs to recall'),
	recentContext: z.string().optional(),
	activeGoal: z.string().optional(),
	types: z.array(z.enum(RECALLABLE_MEMORY_TYPES)).optional(),
});

export const RecallToolOutputSchema = z.array(
	z.object({
		created: z.string(),
		type: MEMORY_FRAGMENT_TYPE_SCHEMA,
		content: z.string(),
		tags: z.array(z.string()),
		origin: z.enum(['system', 'user']),
		additionalContext: z.record(z.string(), z.unknown()).optional(),
	}),
);

export class RecallTool extends AgentTool<
	typeof RecallToolInputSchema,
	typeof RecallToolOutputSchema
> {
	constructor(private readonly deps: { contextAssembler: ContextAssembler }) {
		super({
			name: 'recall',
			description:
				'Retrieve indexed fact chunks, decisions, preferences, or session summaries relevant to the current task.',
			inputSchema: RecallToolInputSchema,
			outputSchema: RecallToolOutputSchema,
		});
	}

	protected async execute(
		input: z.infer<typeof RecallToolInputSchema>,
	): Promise<z.infer<typeof RecallToolOutputSchema>> {
		const memories = await this.deps.contextAssembler.recall({
			context: {
				query: input.query,
				recentContext: input.recentContext,
				activeGoal: input.activeGoal,
			},
			filters: input.types ? { types: input.types } : undefined,
		});

		return memories
			.filter((memory): memory is MemoryFragment => memory !== undefined)
			.map((memory) => ({
				created: memory.created.toISOString(),
				type: memory.type,
				content: memory.content,
				tags: memory.tags,
				origin: memory.origin,
				additionalContext: memory.additionalContext,
			}));
	}
}
