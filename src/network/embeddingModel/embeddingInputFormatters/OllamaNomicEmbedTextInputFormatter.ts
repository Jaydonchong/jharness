import { EmbeddingPurpose } from '@network/embeddingModel/AbstractEmbeddingModel';
import { AbstractEmbeddingInputFormatter } from './AbstractEmbeddingInputFormatter';

export class OllamaNomicEmbedTextInputFormatter extends AbstractEmbeddingInputFormatter {
	public format(text: string, purpose: EmbeddingPurpose): string {
		switch (purpose) {
			case EmbeddingPurpose.INDEXING:
				return `search_document: ${text}`;
			case EmbeddingPurpose.RETRIEVAL:
				return `search_query: ${text}`;
			case EmbeddingPurpose.CLUSTERING:
			case EmbeddingPurpose.CLASSIFICATION:
				return this.notImplemented(purpose);
		}
	}
}
