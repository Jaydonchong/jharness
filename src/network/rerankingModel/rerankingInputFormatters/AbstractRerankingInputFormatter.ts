export abstract class AbstractRerankingInputFormatter {
	public abstract format(
		query: string,
		documents: readonly string[],
	): {
		query: string;
		contexts: Array<{ text: string }>;
	};
}
