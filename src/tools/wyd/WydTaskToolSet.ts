import { WydTaskApi } from '@network/wyd/WydTaskApi';
import { DomainError, ErrorCode } from '@utils/ErrorCode';
import { CreateWydTaskTool } from './CreateWydTaskTool';
import { GetWydTaskTool } from './GetWydTaskTool';
import { ListWydTasksTool } from './ListWydTasksTool';
import { UpdateWydTaskTool } from './UpdateWydTaskTool';

export type WydTaskToolSet = [
	ListWydTasksTool,
	GetWydTaskTool,
	CreateWydTaskTool,
	UpdateWydTaskTool,
];

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
	return [
		new ListWydTasksTool(api),
		new GetWydTaskTool(api),
		new CreateWydTaskTool(api, folderIds),
		new UpdateWydTaskTool(api),
	];
}
