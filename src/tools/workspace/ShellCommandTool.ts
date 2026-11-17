import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import z from 'zod';
import { AgentTool } from '@tools/core/AgentTool';

const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;

export const ShellCommandInputSchema = z.object({
	command: z.string().min(1).describe('Bash command to run inside the workspace'),
});

export const ShellCommandOutputSchema = z.object({
	exitCode: z.number().nullable(),
	stdout: z.string(),
	stderr: z.string(),
});

export class ShellCommandTool extends AgentTool<
	typeof ShellCommandInputSchema,
	typeof ShellCommandOutputSchema
> {
	constructor(private readonly workspaceRoot: string) {
		super({
			name: 'run_shell_command',
			description:
				'Run a Bash command in the workspace. Commands time out after 30 seconds and output is capped at 1 MiB.',
			inputSchema: ShellCommandInputSchema,
			outputSchema: ShellCommandOutputSchema,
		});
	}

	protected async execute(
		input: z.infer<typeof ShellCommandInputSchema>,
	): Promise<z.infer<typeof ShellCommandOutputSchema>> {
		const cwd = await realpath(this.workspaceRoot);

		return new Promise((resolve, reject) => {
			execFile(
				'bash',
				['-c', input.command],
				{
					cwd,
					encoding: 'utf8',
					maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
					timeout: COMMAND_TIMEOUT_MS,
				},
				(error, stdout, stderr) => {
					if (!error) {
						resolve({ exitCode: 0, stdout, stderr });
						return;
					}

					if ('code' in error && typeof error.code === 'number') {
						resolve({ exitCode: error.code, stdout, stderr });
						return;
					}

					reject(error);
				},
			);
		});
	}
}
