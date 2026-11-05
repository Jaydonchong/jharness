import { DomainError, ErrorCode } from '../../../utils/ErrorCode';
import { EmbeddingPurpose } from '../AbstractEmbeddingModel';

export abstract class AbstractEmbeddingInputFormatter {
	public abstract format(text: string, purpose: EmbeddingPurpose): string;

	protected notImplemented(purpose: EmbeddingPurpose): never {
		throw new DomainError(
			ErrorCode.NOT_IMPLEMENTED,
			`Embedding purpose "${purpose}" is not implemented for this input formatter.`,
		);
	}
}
