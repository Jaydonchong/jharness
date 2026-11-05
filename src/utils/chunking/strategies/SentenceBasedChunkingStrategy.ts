import { ChunkingStrategyType, ChunkingStrategy } from './ChunkingStrategy';
import type { ChunkDraft, ChunkingConfig, ChunkingInput } from '../ChunkingTypes';

const SENTENCE_END = /[.!?]+(?:["'’”)}\]]+)?(?=\s|$)/g;

export class SentenceBasedChunkingStrategy extends ChunkingStrategy {
	public constructor() {
		super(ChunkingStrategyType.SENTENCE, '1');
	}

	public split(input: ChunkingInput, config: ChunkingConfig): ChunkDraft[] {
		this.validateConfig(config);

		const ranges: Array<{ startOffset: number; endOffset: number }> = [];
		let startOffset = 0;
		let match: RegExpExecArray | null;

		SENTENCE_END.lastIndex = 0;
		while ((match = SENTENCE_END.exec(input.content)) !== null) {
			const endOffset = SENTENCE_END.lastIndex;
			ranges.push({ startOffset, endOffset });
			startOffset = endOffset;
		}

		ranges.push({ startOffset, endOffset: input.content.length });
		return super.createChunkDrafts(
			input.content,
			super.groupRanges(input.content, ranges, config.chunkSizeLimit, config.overlap),
		);
	}
}
