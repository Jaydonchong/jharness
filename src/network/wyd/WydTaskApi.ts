import axios, { AxiosInstance } from 'axios';
import { DomainError, ErrorCode } from '@utils/ErrorCode';

export type WydTask = {
	id: string;
	referenceId?: string;
	title: string;
	description?: string;
	notesMd?: string | null;
	folderId: string | null;
	folderName?: string | null;
	statusKey?: string;
	statusName?: string;
	statusCategory?: 'open' | 'blocked' | 'done' | 'cancelled';
	priority?: number;
	expectedAt?: string | null;
	tags?: string[];
};

export type WydTaskPatch = {
	title?: string;
	description?: string;
	notesMd?: string | null;
	status?: string;
	priority?: number;
	expectedAt?: string | null;
	tags?: string[];
};

export type WydTaskCreate = {
	title: string;
	folderId: string;
	description?: string;
	notesMd?: string | null;
	status?: string;
	priority?: number;
	expectedAt?: string | null;
	tags?: string[];
};

type WydTasksResponse = {
	data: WydTask[];
	meta: { total: number };
};

type WydTaskResponse = { data: WydTask };

export class WydTaskApi {
	private readonly http: AxiosInstance;
	private readonly allowedFolderIds: Set<string>;

	constructor(baseUrl: string, token: string, allowedFolderIds: string[]) {
		const url = new URL(baseUrl);
		if (
			!['http:', 'https:'].includes(url.protocol) ||
			url.pathname !== '/' ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		) {
			throw new DomainError(
				ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
				'WYD_API_BASE_URL must be an HTTP origin without a path',
			);
		}
		if (!allowedFolderIds.length) {
			throw new DomainError(
				ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
				'WYD_ALLOWED_FOLDER_IDS must contain at least one folder ID',
			);
		}

		this.allowedFolderIds = new Set(allowedFolderIds);
		this.http = axios.create({
			baseURL: new URL('/api/v1/', url.origin).toString(),
			timeout: 15_000,
			headers: { Authorization: `Bearer ${token}` },
		});
	}

	async listTasks(limit: number, offset: number): Promise<{ tasks: WydTask[]; total: number }> {
		const response = await this.request(() =>
			this.http.get<WydTasksResponse>('tasks', {
				params: {
					folderId: [...this.allowedFolderIds].join(','),
					limit,
					offset,
					fields: 'default',
				},
			}),
		);
		response.data.forEach((task) => this.assertAllowedFolder(task));
		return { tasks: response.data, total: response.meta.total };
	}

	async getTask(taskId: string): Promise<WydTask> {
		const response = await this.request(() =>
			this.http.get<WydTaskResponse>(`tasks/${encodeURIComponent(taskId)}`),
		);
		this.assertAllowedFolder(response.data);
		return response.data;
	}

	async createTask(input: WydTaskCreate): Promise<WydTask> {
		this.assertAllowedFolder(input);
		const response = await this.request(() => this.http.post<WydTaskResponse>('tasks', input));
		this.assertAllowedFolder(response.data);
		return response.data;
	}

	async updateTask(taskId: string, patch: WydTaskPatch): Promise<WydTask> {
		// Wyd PATCH has no folder-scoped precondition, so this check cannot exclude concurrent moves.
		await this.getTask(taskId);
		const response = await this.request(() =>
			this.http.patch<WydTaskResponse>(`tasks/${encodeURIComponent(taskId)}`, patch),
		);
		this.assertAllowedFolder(response.data);
		return response.data;
	}

	private assertAllowedFolder(task: Pick<WydTask, 'folderId'>): void {
		if (!task.folderId || !this.allowedFolderIds.has(task.folderId)) {
			throw new DomainError(
				ErrorCode.AI_TOOL_CALL_ERROR,
				'Task is outside the configured Wyd folders',
			);
		}
	}

	private async request<T>(request: () => Promise<{ data: T }>): Promise<T> {
		try {
			return (await request()).data;
		} catch (error) {
			if (error instanceof DomainError) throw error;
			const status = axios.isAxiosError(error) ? error.response?.status : undefined;
			const cause = axios.isAxiosError(error)
				? { code: error.code, message: error.message }
				: undefined;
			throw new DomainError(
				ErrorCode.NETWORK_ERROR,
				status ? `Wyd API request failed (${status})` : 'Wyd API request failed',
				cause,
			);
		}
	}
}
