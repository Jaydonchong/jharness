import z from 'zod';
import { WydTaskApi } from '@network/wyd/WydTaskApi';
import { AgentTool } from '@tools/core/AgentTool';
import { toWydTaskResult, WydTaskResultSchema } from './WydTaskResult';

export const ListWydTasksInputSchema = z
	.object({
		limit: z.number().int().min(1).max(100).default(50),
		offset: z.number().int().min(0).default(0),
	})
	.strict();

export const ListWydTasksOutputSchema = z.object({
	tasks: z.array(WydTaskResultSchema),
	total: z.number().int(),
	limit: z.number().int(),
	offset: z.number().int(),
});

export class ListWydTasksTool extends AgentTool<
	typeof ListWydTasksInputSchema,
	typeof ListWydTasksOutputSchema
> {
	constructor(private readonly api: WydTaskApi) {
		super({
			name: 'wyd_list_tasks',
			description:
				'List tasks from the folders configured in WYD_ALLOWED_FOLDER_IDS. Use the returned task ID or reference ID to read or update a task.',
			inputSchema: ListWydTasksInputSchema,
			outputSchema: ListWydTasksOutputSchema,
		});
	}

	protected async execute(input: z.infer<typeof ListWydTasksInputSchema>) {
		const limit = input.limit ?? 50;
		const offset = input.offset ?? 0;
		const { tasks, total } = await this.api.listTasks(limit, offset);
		return { tasks: tasks.map(toWydTaskResult), total, limit, offset };
	}
}
