import z from 'zod';
import { WydTask } from '@network/wyd/WydTaskApi';

export const WydTaskResultSchema = z.object({
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

export const toWydTaskResult = (task: WydTask) => ({
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
