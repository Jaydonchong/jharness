import z from 'zod';
import { WydTaskApi } from '@network/wyd/WydTaskApi';
import { AgentTool } from '@tools/core/AgentTool';
import { toWydTaskResult, WydTaskResultSchema } from './WydTaskResult';

export const GetWydTaskInputSchema = z.object({ taskId: z.string().min(1) }).strict();
export const GetWydTaskOutputSchema = WydTaskResultSchema;

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
		return toWydTaskResult(await this.api.getTask(input.taskId));
	}
}
