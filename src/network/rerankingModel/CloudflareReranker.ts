import axios from 'axios';
import { asDomainError, DomainError, ErrorCode } from '../../utils/ErrorCode';
import { AbstractRerankingModel } from './AbstractRerankingModel';
import { AbstractRerankingInputFormatter } from './rerankingInputFormatters/AbstractRerankingInputFormatter';
import { CloudflareBgeRerankerInputFormatter } from './rerankingInputFormatters/CloudflareBgeRerankerInputFormatter';

type CloudflareRerankerResponse = {
	result?: {
		response?: Array<{ id: number; score: number }>;
	};
	response?: Array<{ id: number; score: number }>;
};

type CloudflareRerankerConfig = {
	accountId?: string;
	apiToken?: string;
	timeoutMs?: number;
};

export enum CloudflareRerankerModel {
	BGE_RERANKER_BASE = '@cf/baai/bge-reranker-base',
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class CloudflareReranker extends AbstractRerankingModel<CloudflareRerankerModel> {
	private readonly http;
	private readonly inputFormatterRegistry = new Map<
		CloudflareRerankerModel,
		AbstractRerankingInputFormatter
	>([[CloudflareRerankerModel.BGE_RERANKER_BASE, new CloudflareBgeRerankerInputFormatter()]]);

	public constructor(config: CloudflareRerankerConfig = {}) {
		super('Cloudflare Workers AI');

		const accountId = config.accountId ?? process.env.CLOUDFLARE_AI_WORKER_ACCOUNT_ID;
		const apiToken = config.apiToken ?? process.env.CLOUDFLARE_AI_WORKER_API_TOKEN;
		if (!accountId || !apiToken) {
			throw new DomainError(
				ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
				'Cloudflare reranking requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AUTH_TOKEN.',
			);
		}

		this.http = axios.create({
			baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`,
			timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			headers: { Authorization: `Bearer ${apiToken}` },
		});
	}

	protected async scoreDocuments(
		query: string,
		documents: readonly string[],
		model: CloudflareRerankerModel = CloudflareRerankerModel.BGE_RERANKER_BASE,
	): Promise<number[]> {
		try {
			const inputFormatter = this.inputFormatterRegistry.get(model);
			if (!inputFormatter) {
				throw new DomainError(
					ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
					`No Cloudflare input formatter is registered for reranker model "${model}".`,
				);
			}

			const response = await this.http.post<CloudflareRerankerResponse>(
				`/${model}`,
				inputFormatter.format(query, documents),
			);
			const rankedContexts = response.data.result?.response ?? response.data.response;
			if (!rankedContexts || rankedContexts.length !== documents.length) {
				throw new DomainError(
					ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
					'Cloudflare reranker returned an incomplete response.',
				);
			}

			const scores = new Array<number>(documents.length);
			for (const { id, score } of rankedContexts) {
				if (
					!Number.isInteger(id) ||
					id < 0 ||
					id >= documents.length ||
					!Number.isFinite(score) ||
					scores[id] !== undefined
				) {
					throw new DomainError(
						ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
						'Cloudflare reranker returned an invalid context id or score.',
					);
				}
				scores[id] = score;
			}
			if (scores.some((score) => score === undefined)) {
				throw new DomainError(
					ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
					'Cloudflare reranker omitted one or more context scores.',
				);
			}

			return scores;
		} catch (error) {
			throw asDomainError(
				error,
				ErrorCode.NETWORK_ERROR,
				'Cloudflare reranking request failed.',
			);
		}
	}
}
