import { DomainError, ErrorCode } from '@utils/ErrorCode';

export type RerankedDocument = {
	index: number;
	document: string;
	score: number;
};

/** Provider-independent contract for scoring and ordering candidate documents. */
export abstract class AbstractRerankingModel<TModel = string> {
	public readonly name: string;

	constructor(name: string) {
		this.name = name;
	}

	public async rerank(
		query: string,
		documents: readonly string[],
		model?: TModel,
	): Promise<RerankedDocument[]> {
		if (!query.trim()) {
			throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Reranking query must not be empty.');
		}

		if (documents.length === 0) {
			return [];
		}

		if (documents.some((document) => !document.trim())) {
			throw new DomainError(
				ErrorCode.VALIDATION_ERROR,
				'Reranking documents must not be empty.',
			);
		}

		const scores = await this.scoreDocuments(query, documents, model);
		if (scores.length !== documents.length || scores.some((score) => !Number.isFinite(score))) {
			throw new DomainError(
				ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
				`Reranking provider returned ${scores.length} invalid scores for ${documents.length} documents.`,
			);
		}

		return documents
			.map((document, index) => ({ index, document, score: scores[index] }))
			.sort((left, right) => right.score - left.score || left.index - right.index);
	}

	protected abstract scoreDocuments(
		query: string,
		documents: readonly string[],
		model?: TModel,
	): Promise<number[]>;
}
