import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import z from 'zod';
import { AgentTool } from '../core/AgentTool';
import { resolveAbsolutePath } from './WorkspaceFileUtils';
import { DomainError, ErrorCode } from '../../utils/ErrorCode';

const MAX_WALK_ENTRIES = 500;

export const WalkDirectoryInputSchema = z.object({
	path: z.string().min(1).describe('Absolute path of the directory to walk'),
	maxDepth: z.number().int().min(1).max(8).optional(),
});

export const WalkDirectoryOutputSchema = z.object({
	entries: z.array(
		z.object({
			path: z.string(),
			type: z.enum(['file', 'directory', 'symlink', 'other']),
		}),
	),
	truncated: z.boolean(),
});

export class WalkDirectoryTool extends AgentTool<
	typeof WalkDirectoryInputSchema,
	typeof WalkDirectoryOutputSchema
> {
	constructor() {
		super({
			name: 'walk_directory',
			description:
				'List files and directories under an absolute directory path. Symlink entries are listed and skipped during traversal. Concurrent filesystem changes can affect path-based traversal; this tool is not a filesystem sandbox. Results are limited to 500 entries and depth 3 by default.',
			inputSchema: WalkDirectoryInputSchema,
			outputSchema: WalkDirectoryOutputSchema,
		});
	}

	protected async execute(
		input: z.infer<typeof WalkDirectoryInputSchema>,
	): Promise<z.infer<typeof WalkDirectoryOutputSchema>> {
		const requestedRoot = resolveAbsolutePath(input.path);
		const maxDepth = input.maxDepth ?? 3;
		const entries: z.infer<typeof WalkDirectoryOutputSchema>['entries'] = [];
		let truncated = false;

		const rootInfo = await lstat(requestedRoot);
		if (rootInfo.isSymbolicLink()) {
			return {
				entries: [{ path: requestedRoot, type: 'symlink' }],
				truncated,
			};
		}
		if (!rootInfo.isDirectory()) {
			throw new DomainError(ErrorCode.AI_TOOL_CALL_ERROR, 'Path must point to a directory');
		}

		const visit = async (directory: string, depth: number): Promise<void> => {
			const children = await readdir(directory, { withFileTypes: true });
			for (const child of children) {
				if (entries.length >= MAX_WALK_ENTRIES) {
					truncated = true;
					return;
				}

				const childPath = path.join(directory, child.name);
				const type = child.isDirectory()
					? 'directory'
					: child.isFile()
						? 'file'
						: child.isSymbolicLink()
							? 'symlink'
							: 'other';
				entries.push({ path: childPath, type });

				if (type === 'directory') {
					const currentInfo = await lstat(childPath);
					if (currentInfo.isSymbolicLink()) {
						entries[entries.length - 1].type = 'symlink';
						continue;
					}
					if (!currentInfo.isDirectory()) continue;

					if (depth < maxDepth) {
						await visit(childPath, depth + 1);
						if (truncated) return;
					} else if ((await readdir(childPath)).length > 0) {
						truncated = true;
					}
				}
			}
		};

		await visit(requestedRoot, 1);
		return { entries, truncated };
	}
}
