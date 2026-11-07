import axios from 'axios';
import { asDomainError, DomainError, ErrorCode } from '../../utils/ErrorCode';
import logger from '../../utils/Logger';
import { TextChunker } from '../../utils/chunking/TextChunker';
import { ChunkingStrategyType } from '../../utils/chunking/strategies/ChunkingStrategy';

const TIMEOUT = 15_000;
const MAX_MESSAGE_CHARACTERS = 2_000;
const MAX_JITTER_MS = 1_000;

const partHeader = (part: number, total: number): string => `**Part ${part}/${total}**\n\n`;

const waitForJitter = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, Math.random() * MAX_JITTER_MS));

export class DiscordWebhookApi {
	private readonly webhookUrl: string;
	private readonly chunker = new TextChunker();

	constructor(webhookUrl = process.env.DISCORD_CHANNEL_WEBHOOK_URL) {
		if (!webhookUrl) {
			throw new DomainError(
				ErrorCode.SERVER_ERROR,
				'DISCORD_CHANNEL_WEBHOOK_URL is required',
			);
		}

		this.webhookUrl = webhookUrl;
	}

	async sendMessage(content: string): Promise<void> {
		const chunks = this.chunkContent(content);

		for (let index = 0; index < chunks.length; index++) {
			if (index > 0) await waitForJitter();
			await this.sendChunk(chunks[index], index + 1, chunks.length);
		}
	}

	private chunkContent(content: string): string[] {
		if (content.length <= MAX_MESSAGE_CHARACTERS) return [content];

		const paragraphs = this.chunker.chunk({ content }, ChunkingStrategyType.PARAGRAPH, 1, 0);
		if (paragraphs.length === 0) return [content];

		const maxPartHeaderLength = partHeader(content.length, content.length).length;
		const maxBodyCharacters = MAX_MESSAGE_CHARACTERS - maxPartHeaderLength;
		const blocks: string[] = [];

		paragraphs.forEach(({ content: paragraph }, index) => {
			if (paragraph.length <= maxBodyCharacters) {
				blocks.push(paragraph);
				return;
			}

			const subheader = `*Paragraph ${index + 1} continued*\n\n`;
			const sentenceLimit = maxBodyCharacters - subheader.length;
			const sentences = this.chunker.chunk(
				{ content: paragraph },
				ChunkingStrategyType.SENTENCE,
				1,
				0,
			);
			const sentenceParts = sentences.flatMap(({ content: sentence }) =>
				sentence.length <= sentenceLimit
					? [sentence]
					: this.chunker
							.chunk(
								{ content: sentence },
								ChunkingStrategyType.FIXED_WINDOW,
								sentenceLimit,
								0,
							)
							.map(({ content: part }) => part),
			);

			let current = '';
			for (const sentence of sentenceParts) {
				const next = current ? `${current} ${sentence}` : sentence;
				if (current && next.length > sentenceLimit) {
					blocks.push(`${subheader}${current}`);
					current = sentence;
				} else {
					current = next;
				}
			}
			if (current) blocks.push(`${subheader}${current}`);
		});

		const chunks: string[] = [];
		let current = '';
		for (const block of blocks) {
			const next = current ? `${current}\n\n${block}` : block;
			if (current && next.length > maxBodyCharacters) {
				chunks.push(current);
				current = block;
			} else {
				current = next;
			}
		}
		if (current) chunks.push(current);

		return chunks.map((chunk, index) => `${partHeader(index + 1, chunks.length)}${chunk}`);
	}

	private async sendChunk(
		content: string,
		chunkNumber: number,
		chunkCount: number,
	): Promise<void> {
		try {
			await axios.post(
				this.webhookUrl,
				{
					content,
					allowed_mentions: { parse: [] },
				},
				{
					params: { wait: true },
					timeout: TIMEOUT,
				},
			);
		} catch (error) {
			const axiosError = axios.isAxiosError(error) ? error : undefined;
			const responseData = asRecord(axiosError?.response?.data);
			const responseHeaders = axiosError?.response?.headers;
			const retryAfter = responseHeaders?.['retry-after'];

			logger.error('Discord webhook request failed', {
				chunkNumber,
				chunkCount,
				contentLength: content.length,
				status: axiosError?.response?.status,
				discordCode: responseData?.code,
				discordMessage: responseData?.message,
				axiosCode: axiosError?.code,
				errorType: error instanceof Error ? error.name : typeof error,
				retryAfter: retryAfter ?? responseData?.retry_after,
				rateLimitBucket: responseHeaders?.['x-ratelimit-bucket'],
				rateLimitScope: responseHeaders?.['x-ratelimit-scope'],
			});

			throw asDomainError(error, ErrorCode.NETWORK_ERROR, 'Discord webhook request failed');
		}
	}
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
