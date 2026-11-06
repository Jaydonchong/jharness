import { Engine, OpenSERP, SERPError } from '@openserp/sdk';
import { DomainError, ErrorCode } from '../../utils/ErrorCode';
import { IWebSearchAdapter, WebSearchRequest, WebSearchResult } from './Interfaces';

const DEFAULT_ENGINE: Engine = 'google';
const DEFAULT_LIMIT = 5;

export class OpenSerpSearchAdapter implements IWebSearchAdapter {
	private readonly engine: Engine;

	constructor(private readonly deps: { client: OpenSERP; engine?: Engine }) {
		this.engine = deps.engine ?? DEFAULT_ENGINE;
	}

	public async search(request: WebSearchRequest): Promise<WebSearchResult[]> {
		try {
			const response = await this.deps.client.search({
				engine: this.engine,
				text: request.query,
				limit: request.limit ?? DEFAULT_LIMIT,
				format: 'json',
			});

			return response.results
				.filter((result) => result.type === 'organic')
				.map(({ rank, engine, title, url, snippet }) => ({
					rank,
					engine,
					title,
					url,
					snippet,
				}));
		} catch (error) {
			if (error instanceof DomainError) throw error;

			const details =
				error instanceof SERPError
					? `${error.code ?? error.status}: ${error.message}`
					: error instanceof Error
						? error.message
						: String(error);

			throw new DomainError(
				ErrorCode.NETWORK_ERROR,
				`OpenSERP search failed: ${details}`,
				error,
			);
		}
	}
}
