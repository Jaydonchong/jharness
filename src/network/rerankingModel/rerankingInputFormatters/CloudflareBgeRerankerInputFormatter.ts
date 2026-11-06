import { AbstractRerankingInputFormatter } from './AbstractRerankingInputFormatter';

export class CloudflareBgeRerankerInputFormatter extends AbstractRerankingInputFormatter {
	public format(
		query: string,
		documents: readonly string[],
	): {
		query: string;
		contexts: Array<{ text: string }>;
	} {
		return {
			query,
			contexts: documents.map((text) => ({ text })),
		};
	}
}
