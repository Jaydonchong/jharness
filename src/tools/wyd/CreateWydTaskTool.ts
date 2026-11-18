import z from 'zod';
import { WydTaskApi, WydTaskCreate } from '@network/wyd/WydTaskApi';
import { AgentTool } from '@tools/core/AgentTool';
import { toWydTaskResult, WydTaskResultSchema } from './WydTaskResult';

export const CreateWydTaskInputSchema = z
	.object({
		title: z.string().min(1),
		folderId: z.string().min(1),
		description: z.string().optional(),
		notesMd: z.string().nullable().optional(),
		status: z.string().min(1).optional(),
		priority: z.number().int().min(0).max(3).optional(),
		expectedAt: z.string().datetime().nullable().optional(),
		tags: z.array(z.string()).optional(),
	})
	.strict();

export const CreateWydTaskOutputSchema = WydTaskResultSchema;

export class CreateWydTaskTool extends AgentTool<
	typeof CreateWydTaskInputSchema,
	typeof CreateWydTaskOutputSchema
> {
	constructor(
		private readonly api: WydTaskApi,
		allowedFolderIds: string[],
	) {
		super({
			name: 'wyd_create_task',
			description: `Create a task in one of these configured folders: ${allowedFolderIds.join(', ')}. Omitted status uses that folder's default. Omitted expectedAt defaults to 17:00 on the server's local day; send null for no due date. When provided, expectedAt must be a UTC ISO 8601 datetime ending in Z (for example, 2026-11-19T01:00:00Z). The assignee defaults to the acting identity.`,
			inputSchema: CreateWydTaskInputSchema,
			outputSchema: CreateWydTaskOutputSchema,
		});
	}

	protected async execute(input: z.infer<typeof CreateWydTaskInputSchema>) {
		return toWydTaskResult(await this.api.createTask(input as WydTaskCreate));
	}
}
