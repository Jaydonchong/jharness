import type { ChunkDraft, ChunkingConfig, ChunkingInput } from '../ChunkingTypes';
import { ChunkingStrategyType, ChunkingStrategy } from './ChunkingStrategy';

export class FixedWindowChunkingStrategy extends ChunkingStrategy {
	public constructor() {
		super(ChunkingStrategyType.FIXED_WINDOW, '1');
	}

	public split(input: ChunkingInput, config: ChunkingConfig): ChunkDraft[] {
		this.validateConfig(config);

		const ranges: Array<{ startOffset: number; endOffset: number }> = [];
		let startOffset = 0;

		while (startOffset < input.content.length) {
			let endOffset = Math.min(startOffset + config.chunkSizeLimit, input.content.length);
			endOffset = avoidSplittingSurrogatePair(input.content, endOffset, startOffset);

			if (endOffset <= startOffset) {
				endOffset = Math.min(startOffset + 2, input.content.length);
			}

			ranges.push({ startOffset, endOffset });

			if (endOffset === input.content.length) {
				break;
			}

			startOffset = Math.max(startOffset + 1, endOffset - config.overlap);
			startOffset = advancePastSurrogatePair(input.content, startOffset);
		}

		return super.createChunkDrafts(input.content, ranges);
	}
}

function avoidSplittingSurrogatePair(content: string, offset: number, startOffset: number): number {
	if (isInsideSurrogatePair(content, offset)) {
		return offset > startOffset + 1 ? offset - 1 : offset + 1;
	}

	return offset;
}

function advancePastSurrogatePair(content: string, offset: number): number {
	return isInsideSurrogatePair(content, offset) ? offset + 1 : offset;
}

/** Returns true when the offset falls between a high and low UTF-16 surrogate. */
function isInsideSurrogatePair(content: string, offset: number): boolean {
	if (offset <= 0 || offset >= content.length) {
		return false;
	}

	const previousCodeUnit = content.charCodeAt(offset - 1);
	const currentCodeUnit = content.charCodeAt(offset);
	return (
		previousCodeUnit >= 0xd800 &&
		previousCodeUnit <= 0xdbff &&
		currentCodeUnit >= 0xdc00 &&
		currentCodeUnit <= 0xdfff
	);
}
