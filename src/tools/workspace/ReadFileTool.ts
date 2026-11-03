import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import z from 'zod';
import { AgentTool } from '../core/AgentTool';
import { MAX_FILE_SIZE_BYTES, resolveAbsolutePath } from './WorkspaceFileUtils';
import { DomainError, ErrorCode } from '../../utils/ErrorCode';

export const ReadFileInputSchema = z.object({
	path: z.string().min(1).describe('Absolute path of the file to read'),
});

export const ReadFileOutputSchema = z.object({
	content: z.string(),
});

export class ReadFileTool extends AgentTool<
	typeof ReadFileInputSchema,
	typeof ReadFileOutputSchema
> {
	constructor() {
		super({
			name: 'read_file',
			description: 'Read a UTF-8 text file at an absolute path, up to 1 MiB.',
			inputSchema: ReadFileInputSchema,
			outputSchema: ReadFileOutputSchema,
		});
	}

	protected async execute(
		input: z.infer<typeof ReadFileInputSchema>,
	): Promise<z.infer<typeof ReadFileOutputSchema>> {
		const filePath = resolveAbsolutePath(input.path);
		const file = await open(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
		try {
			const fileInfo = await file.stat();
			if (!fileInfo.isFile()) {
				throw new DomainError(
					ErrorCode.AI_TOOL_CALL_ERROR,
					'Path must point to a regular file',
				);
			}
			if (fileInfo.size > MAX_FILE_SIZE_BYTES) {
				throw new DomainError(
					ErrorCode.AI_TOOL_CALL_ERROR,
					'File exceeds the 1 MiB read limit',
				);
			}

			const contents = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
			let bytesRead = 0;
			while (bytesRead < contents.byteLength) {
				const result = await file.read(
					contents,
					bytesRead,
					contents.byteLength - bytesRead,
					bytesRead,
				);
				if (result.bytesRead === 0) break;
				bytesRead += result.bytesRead;
			}
			if (bytesRead > MAX_FILE_SIZE_BYTES) {
				throw new DomainError(
					ErrorCode.AI_TOOL_CALL_ERROR,
					'File exceeds the 1 MiB read limit',
				);
			}
			return {
				content: contents.subarray(0, bytesRead).toString('utf8'),
			};
		} finally {
			await file.close();
		}
	}
}
