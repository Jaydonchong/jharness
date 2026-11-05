import { createHash } from 'node:crypto';
import type { ChunkDraft, ChunkingConfig, ChunkingInput, ChunkingMetadata } from '../ChunkingTypes';

export enum ChunkingStrategyType {
	PARAGRAPH = 'PARAGRAPH',
	SENTENCE = 'SENTENCE',
	FIXED_WINDOW = 'FIXED_WINDOW',
}

export abstract class ChunkingStrategy {
	protected constructor(
		private readonly strategyType: ChunkingStrategyType,
		private readonly version: string,
	) {}

	public createMetadata(config: ChunkingConfig): ChunkingMetadata {
		return {
			strategy: this.strategyType,
			version: this.version,
			configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
		};
	}

	public abstract split(input: ChunkingInput, config: ChunkingConfig): ChunkDraft[];

	protected validateConfig(config: ChunkingConfig): void {
		if (!Number.isInteger(config.chunkSizeLimit) || config.chunkSizeLimit <= 0) {
			throw new RangeError('Chunk size limit must be a positive integer.');
		}

		if (
			!Number.isInteger(config.overlap) ||
			config.overlap < 0 ||
			config.overlap >= config.chunkSizeLimit
		) {
			throw new RangeError(
				'Chunk overlap must be non-negative and smaller than the chunk size limit.',
			);
		}
	}

	protected groupRanges(
		content: string,
		ranges: Array<{ startOffset: number; endOffset: number }>,
		chunkSizeLimit: number,
		overlap: number,
	): Array<{ startOffset: number; endOffset: number }> {
		const nonEmptyRanges = ranges.filter(({ startOffset, endOffset }) =>
			content.slice(startOffset, endOffset).trim(),
		);
		const groupedRanges: Array<{ startOffset: number; endOffset: number }> = [];
		let rangeIndex = 0;

		while (rangeIndex < nonEmptyRanges.length) {
			const groupEndIndex = Math.min(rangeIndex + chunkSizeLimit, nonEmptyRanges.length);
			groupedRanges.push({
				startOffset: nonEmptyRanges[rangeIndex].startOffset,
				endOffset: nonEmptyRanges[groupEndIndex - 1].endOffset,
			});

			if (groupEndIndex === nonEmptyRanges.length) {
				break;
			}

			rangeIndex = groupEndIndex - overlap;
		}

		return groupedRanges;
	}

	protected createChunkDrafts(
		content: string,
		ranges: Array<{ startOffset: number; endOffset: number }>,
	): ChunkDraft[] {
		return ranges.flatMap(({ startOffset, endOffset }) => {
			const rangeContent = content.slice(startOffset, endOffset);
			const trimmedContent = rangeContent.trim();

			if (!trimmedContent) {
				return [];
			}

			const leadingWhitespaceLength = rangeContent.length - rangeContent.trimStart().length;
			const trimmedStartOffset = startOffset + leadingWhitespaceLength;

			return [
				{
					content: trimmedContent,
					location: {
						startOffset: trimmedStartOffset,
						endOffset: trimmedStartOffset + trimmedContent.length,
					},
					metadata: {},
				},
			];
		});
	}
}
