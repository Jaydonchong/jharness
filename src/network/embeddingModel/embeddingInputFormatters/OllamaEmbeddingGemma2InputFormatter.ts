import { EmbeddingPurpose } from '@network/embeddingModel/AbstractEmbeddingModel';
import { AbstractEmbeddingInputFormatter } from './AbstractEmbeddingInputFormatter';

export class OllamaEmbeddingGemma2InputFormatter extends AbstractEmbeddingInputFormatter {
	public format(text: string, purpose: EmbeddingPurpose): string {
		switch (purpose) {
			case EmbeddingPurpose.INDEXING:
				return `title: none | text: ${text}`;
			case EmbeddingPurpose.RETRIEVAL:
				return `task: search result | query: ${text}`;
			case EmbeddingPurpose.CLUSTERING:
			case EmbeddingPurpose.CLASSIFICATION:
				return this.notImplemented(purpose);
		}
	}
}
