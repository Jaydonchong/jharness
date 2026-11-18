import z from 'zod';
import { WydTask, WydTaskApi, WydTaskPatch } from '@network/wyd/WydTaskApi';
import { AgentTool } from '@tools/core/AgentTool';
import { DomainError, ErrorCode } from '@utils/ErrorCode';

const TaskResultSchema = z.object({
	id: z.string(),
	referenceId: z.string().optional(),
	title: z.string(),
	description: z.string(),
	folderId: z.string(),
	folderName: z.string().nullable(),
	statusKey: z.string().optional(),
	statusName: z.string().optional(),
	statusCategory: z.enum(['open', 'blocked', 'done', 'cancelled']).optional(),
	priority: z.number().optional(),
	expectedAt: z.string().nullable(),
	tags: z.array(z.string()),
	notesMd: z.string().nullable().optional(),
});

const taskResult = (task: WydTask) => ({
	id: task.id,
	referenceId: task.referenceId,
	title: task.title,
	description: task.description ?? '',
	folderId: task.folderId!,
	folderName: task.folderName ?? null,
	statusKey: task.statusKey,
	statusName: task.statusName,
	statusCategory: task.statusCategory,
	priority: task.priority,
	expectedAt: task.expectedAt ?? null,
	tags: task.tags ?? [],
	...(task.notesMd !== undefined ? { notesMd: task.notesMd } : {}),
});

export const ListWydTasksInputSchema = z
	.object({
		limit: z.number().int().min(1).max(100).default(50),
		offset: z.number().int().min(0).default(0),
	})
	.strict();

export const ListWydTasksOutputSchema = z.object({
	tasks: z.array(TaskResultSchema),
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
		return { tasks: tasks.map(taskResult), total, limit, offset };
	}
}

export const GetWydTaskInputSchema = z.object({ taskId: z.string().min(1) }).strict();
export const GetWydTaskOutputSchema = TaskResultSchema;

export class GetWydTaskTool extends AgentTool<
	typeof GetWydTaskInputSchema,
	typeof GetWydTaskOutputSchema
> {
	constructor(private readonly api: WydTaskApi) {
		super({
			name: 'wyd_get_task',
			description:
				'Read one task by ID. The task must belong to a folder configured in WYD_ALLOWED_FOLDER_IDS.',
			inputSchema: GetWydTaskInputSchema,
			outputSchema: GetWydTaskOutputSchema,
		});
	}

	protected async execute(input: z.infer<typeof GetWydTaskInputSchema>) {
		return taskResult(await this.api.getTask(input.taskId));
	}
}

const UpdateFieldsSchema = z.object({
	title: z.string().min(1).optional(),
	description: z.string().optional(),
	notesMd: z.string().nullable().optional(),
	status: z.string().min(1).optional(),
	priority: z.number().int().min(0).max(3).optional(),
	expectedAt: z.string().datetime().nullable().optional(),
	tags: z.array(z.string()).optional(),
});

export const UpdateWydTaskInputSchema = z
	.object({ taskId: z.string().min(1) })
	.extend(UpdateFieldsSchema.shape)
	.strict()
	.refine(
		(input) =>
			Object.keys(UpdateFieldsSchema.shape).some(
				(key) => input[key as keyof typeof input] !== undefined,
			),
		{ message: 'Provide at least one task field to update' },
	);

export const UpdateWydTaskOutputSchema = TaskResultSchema;

export class UpdateWydTaskTool extends AgentTool<
	typeof UpdateWydTaskInputSchema,
	typeof UpdateWydTaskOutputSchema
> {
	constructor(private readonly api: WydTaskApi) {
		super({
			name: 'wyd_update_task',
			description:
				'Update a task in a configured Wyd folder. The tags field replaces the full tag set, so include every tag that should remain. Folder moves are not supported.',
			inputSchema: UpdateWydTaskInputSchema,
			outputSchema: UpdateWydTaskOutputSchema,
		});
	}

	protected async execute(input: z.infer<typeof UpdateWydTaskInputSchema>) {
		const { taskId, ...patch } = input;
		if (!Object.keys(patch).length) {
			throw new DomainError(
				ErrorCode.VALIDATION_ERROR,
				'Provide at least one task field to update',
			);
		}
		return taskResult(await this.api.updateTask(taskId, patch as WydTaskPatch));
	}
}

export type WydTaskToolSet = [ListWydTasksTool, GetWydTaskTool, UpdateWydTaskTool];

export function createWydTaskToolSetFromEnv(): WydTaskToolSet | undefined {
	const baseUrl = process.env.WYD_API_BASE_URL?.trim();
	const token = process.env.WYD_API_TOKEN?.trim();
	const folderIdsValue = process.env.WYD_ALLOWED_FOLDER_IDS;
	const hasAnyConfig = Boolean(baseUrl || token || folderIdsValue?.trim());
	if (!hasAnyConfig) return undefined;

	if (!baseUrl || !token || !folderIdsValue?.trim()) {
		throw new DomainError(
			ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
			'WYD_API_BASE_URL, WYD_API_TOKEN, and WYD_ALLOWED_FOLDER_IDS must be configured together',
		);
	}

	const folderIds = [
		...new Set(
			folderIdsValue
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean),
		),
	];
	if (!folderIds.length) {
		throw new DomainError(
			ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
			'WYD_ALLOWED_FOLDER_IDS must contain at least one folder ID',
		);
	}

	const api = new WydTaskApi(baseUrl, token, folderIds);
	return [new ListWydTasksTool(api), new GetWydTaskTool(api), new UpdateWydTaskTool(api)];
}
