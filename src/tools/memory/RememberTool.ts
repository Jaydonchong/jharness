import z from 'zod';
import { ContextAssembler } from '../../memory/core/ContextAssembler';
import { MEMORY_TYPE, MemoryFragment } from '../../memory/core/Interfaces';
import { DomainError, ErrorCode } from '../../utils/ErrorCode';
import { AgentTool, AgentToolExecutionContext } from '../core/AgentTool';

const SUPPORTED_MEMORY_TYPES = [
	MEMORY_TYPE.DECISION,
	MEMORY_TYPE.PREFERENCE,
	MEMORY_TYPE.SESSION_SUMMARY,
] as const;

const CommonMemoryFields = {
	content: z.string().describe('The memory content to store'),
	tags: z.array(z.string()).describe('Tags used to classify this memory'),
	origin: z.enum(['system', 'user']),
};

export const RememberToolInputSchema = z.discriminatedUnion('operation', [
	z.object({ operation: z.literal('list_preference_groups') }),
	z.object({
		operation: z.literal('store_preference'),
		...CommonMemoryFields,
		group: z.string().min(1),
		filePath: z.string().min(1),
	}),
	z.object({
		operation: z.literal('store_decision'),
		...CommonMemoryFields,
	}),
	z.object({
		operation: z.literal('store_session_summary'),
		...CommonMemoryFields,
		summary: z.string(),
	}),
]);

const PreferenceGroupIndexEntrySchema = z.object({
	group: z.string(),
	created: z.string(),
	updated: z.string(),
	tags: z.array(z.string()),
	origin: z.enum(['system', 'user']),
	filePaths: z.array(z.string()),
});

export const RememberToolOutputSchema = z.discriminatedUnion('operation', [
	z.object({
		operation: z.literal('list_preference_groups'),
		groups: z.array(PreferenceGroupIndexEntrySchema),
	}),
	z.object({
		operation: z.literal('stored'),
		type: z.enum(SUPPORTED_MEMORY_TYPES),
	}),
]);

const getSessionId = (context?: AgentToolExecutionContext): string => {
	if (!context?.sessionId) {
		throw new DomainError(
			ErrorCode.MEMORY_STORAGE_ERROR,
			'Remember tool requires a session ID',
		);
	}

	return context.sessionId;
};

export class RememberTool extends AgentTool<
	typeof RememberToolInputSchema,
	typeof RememberToolOutputSchema
> {
	constructor(private readonly deps: { contextAssembler: ContextAssembler }) {
		super({
			name: 'remember',
			description:
				'Store decisions, preferences, and session summaries. Before storing a preference, list the preference groups and select a group and file path from the returned index.',
			inputSchema: RememberToolInputSchema,
			outputSchema: RememberToolOutputSchema,
		});
	}

	protected async execute(
		input: z.infer<typeof RememberToolInputSchema>,
		context?: AgentToolExecutionContext,
	): Promise<z.infer<typeof RememberToolOutputSchema>> {
		if (input.operation === 'list_preference_groups') {
			const groups = await this.deps.contextAssembler.listPreferenceGroups();
			return { operation: 'list_preference_groups', groups };
		}

		let memory: MemoryFragment;
		let storedType: (typeof SUPPORTED_MEMORY_TYPES)[number];
		switch (input.operation) {
			case 'store_preference':
				storedType = MEMORY_TYPE.PREFERENCE;
				memory = {
					created: new Date(),
					type: MEMORY_TYPE.PREFERENCE,
					content: input.content,
					tags: input.tags,
					origin: input.origin,
					additionalContext: {
						group: input.group,
						filePath: input.filePath,
					},
				};
				break;
			case 'store_decision':
				storedType = MEMORY_TYPE.DECISION;
				memory = {
					created: new Date(),
					type: MEMORY_TYPE.DECISION,
					content: input.content,
					tags: input.tags,
					origin: input.origin,
					additionalContext: {
						sessionId: getSessionId(context),
					},
				};
				break;
			case 'store_session_summary':
				storedType = MEMORY_TYPE.SESSION_SUMMARY;
				memory = {
					created: new Date(),
					type: MEMORY_TYPE.SESSION_SUMMARY,
					content: input.content,
					tags: input.tags,
					origin: input.origin,
					additionalContext: {
						sessionId: getSessionId(context),
						summary: input.summary,
					},
				};
				break;
		}

		await this.deps.contextAssembler.remember(memory);
		return { operation: 'stored', type: storedType };
	}
}
