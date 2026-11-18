import z from 'zod';
import { WydTaskApi, WydTaskPatch } from '@network/wyd/WydTaskApi';
import { AgentTool } from '@tools/core/AgentTool';
import { DomainError, ErrorCode } from '@utils/ErrorCode';
import { toWydTaskResult, WydTaskResultSchema } from './WydTaskResult';

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

export const UpdateWydTaskOutputSchema = WydTaskResultSchema;

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
		return toWydTaskResult(await this.api.updateTask(taskId, patch as WydTaskPatch));
	}
}
