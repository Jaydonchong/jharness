import axios from 'axios';
import { asDomainError, DomainError, ErrorCode } from '@utils/ErrorCode';
import { AbstractEmbeddingModel, EmbeddingPurpose } from './AbstractEmbeddingModel';
import { AbstractEmbeddingInputFormatter } from './embeddingInputFormatters/AbstractEmbeddingInputFormatter';
import { OllamaEmbeddingGemma2InputFormatter } from './embeddingInputFormatters/OllamaEmbeddingGemma2InputFormatter';
import { OllamaNomicEmbedTextInputFormatter } from './embeddingInputFormatters/OllamaNomicEmbedTextInputFormatter';

type OllamaEmbeddingResponse = {
	embeddings?: number[][];
};

type OllamaEmbedderConfig = {
	baseUrl?: string;
	timeoutMs?: number;
};

export enum OllamaEmbeddingModel {
	EMBEDDINGGEMMA_2_270M = 'embeddinggemma-2:270m',
	NOMIC_EMBED_TEXT = 'nomic-embed-text',
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 60_000;

export class OllamaEmbedder extends AbstractEmbeddingModel<OllamaEmbeddingModel> {
	private readonly http;
	private readonly inputFormatterRegistry = new Map<
		OllamaEmbeddingModel,
		AbstractEmbeddingInputFormatter
	>([
		[OllamaEmbeddingModel.EMBEDDINGGEMMA_2_270M, new OllamaEmbeddingGemma2InputFormatter()],
		[OllamaEmbeddingModel.NOMIC_EMBED_TEXT, new OllamaNomicEmbedTextInputFormatter()],
	]);

	public constructor(config: OllamaEmbedderConfig) {
		super('Ollama');

		const baseUrl = (config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(
			/\/+$/,
			'',
		);
		this.http = axios.create({
			baseURL: `${baseUrl}/api`,
			timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		});
	}

	protected async embedText(
		texts: readonly string[],
		purpose: EmbeddingPurpose,
		model: OllamaEmbeddingModel = OllamaEmbeddingModel.EMBEDDINGGEMMA_2_270M,
	): Promise<number[][]> {
		try {
			const inputFormatter = this.inputFormatterRegistry.get(model);
			if (!inputFormatter) {
				throw new DomainError(
					ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
					`No Ollama input formatter is registered for model "${model}".`,
				);
			}

			const response = await this.http.post<OllamaEmbeddingResponse>('/embed', {
				model,
				input: texts.map((text) => inputFormatter.format(text, purpose)),
			});

			return response.data.embeddings ?? [];
		} catch (error) {
			throw asDomainError(error, ErrorCode.NETWORK_ERROR, 'Ollama embedding request failed.');
		}
	}
}
