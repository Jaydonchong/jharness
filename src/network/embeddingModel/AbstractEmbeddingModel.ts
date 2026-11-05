import { DomainError, ErrorCode } from '../../utils/ErrorCode';

export enum EmbeddingPurpose {
	INDEXING = 'indexing',
	RETRIEVAL = 'retrieval',
	CLUSTERING = 'clustering',
	CLASSIFICATION = 'classification',
}

/** Provider-independent contract for generating embedding vectors. */
export abstract class AbstractEmbeddingModel<TModel = string> {
	public readonly name: string;

	constructor(name: string) {
		this.name = name;
	}

	public async embed(
		texts: readonly string[],
		purpose: EmbeddingPurpose,
		model?: TModel,
	): Promise<number[][]> {
		if (texts.length === 0) {
			return [];
		}

		if (texts.some((text) => !text.trim())) {
			throw new DomainError(
				ErrorCode.VALIDATION_ERROR,
				'Embedding input text must not be empty.',
			);
		}

		const vectors = await this.embedText(texts, purpose, model);
		return this.validateVectors(vectors, texts.length);
	}

	protected abstract embedText(
		texts: readonly string[],
		purpose: EmbeddingPurpose,
		model?: TModel,
	): Promise<number[][]>;

	private validateVectors(vectors: number[][], expectedCount: number): number[][] {
		if (vectors.length !== expectedCount) {
			throw new DomainError(
				ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
				`Embedding provider returned ${vectors.length} vectors for ${expectedCount} inputs.`,
			);
		}

		const dimensions = vectors[0]?.length;
		if (!dimensions) {
			throw new DomainError(
				ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
				'Embedding provider returned an empty vector.',
			);
		}

		if (
			vectors.some(
				(vector) =>
					vector.length !== dimensions || vector.some((value) => !Number.isFinite(value)),
			)
		) {
			throw new DomainError(
				ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
				'Embedding provider returned invalid or inconsistent vectors.',
			);
		}

		return vectors;
	}
}
