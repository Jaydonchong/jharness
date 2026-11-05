import { ChunkingStrategyType, ChunkingStrategy } from './ChunkingStrategy';
import type { ChunkDraft, ChunkingConfig, ChunkingInput } from '../ChunkingTypes';

const PARAGRAPH_BREAK = /(?:\r?\n[\t ]*){2,}/g;

export class ParagraphChunkingStrategy extends ChunkingStrategy {
	public constructor() {
		super(ChunkingStrategyType.PARAGRAPH, '1');
	}

	public split(input: ChunkingInput, config: ChunkingConfig): ChunkDraft[] {
		this.validateConfig(config);
		PARAGRAPH_BREAK.lastIndex = 0;
		return super.createChunkDrafts(
			input.content,
			super.groupRanges(
				input.content,
				this.splitOnPattern(input.content, PARAGRAPH_BREAK),
				config.chunkSizeLimit,
				config.overlap,
			),
		);
	}

	private splitOnPattern(
		content: string,
		pattern: RegExp,
	): Array<{ startOffset: number; endOffset: number }> {
		const ranges: Array<{ startOffset: number; endOffset: number }> = [];
		let startOffset = 0;
		let match: RegExpExecArray | null;

		while ((match = pattern.exec(content)) !== null) {
			ranges.push({ startOffset, endOffset: match.index });
			startOffset = pattern.lastIndex;

			if (match[0].length === 0) {
				pattern.lastIndex++;
			}
		}

		ranges.push({ startOffset, endOffset: content.length });
		return ranges;
	}
}
