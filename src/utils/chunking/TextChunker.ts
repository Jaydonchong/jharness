import { FixedWindowChunkingStrategy } from './strategies/FixedWindowChunkingStrategy';
import { ParagraphChunkingStrategy } from './strategies/ParagraphChunkingStrategy';
import { SentenceBasedChunkingStrategy } from './strategies/SentenceBasedChunkingStrategy';
import type { ChunkingInput, ChunkSegment } from './ChunkingTypes';
import { ChunkingStrategyType, ChunkingStrategy } from './strategies/ChunkingStrategy';

export class TextChunker {
	private readonly strategies: Readonly<Record<ChunkingStrategyType, ChunkingStrategy>>;

	public constructor() {
		this.strategies = {
			[ChunkingStrategyType.FIXED_WINDOW]: new FixedWindowChunkingStrategy(),
			[ChunkingStrategyType.SENTENCE]: new SentenceBasedChunkingStrategy(),
			[ChunkingStrategyType.PARAGRAPH]: new ParagraphChunkingStrategy(),
		};
	}

	/** Size and overlap units depend on the selected strategy: characters, sentences, or paragraphs. */
	public chunk(
		input: ChunkingInput,
		strategyType: ChunkingStrategyType,
		chunkSizeLimit: number,
		overlap: number,
	): ChunkSegment[] {
		const strategy = this.strategies[strategyType];

		if (!strategy) {
			throw new TypeError(`Unsupported chunking strategy: ${strategyType}.`);
		}

		const config = { chunkSizeLimit, overlap };
		const drafts = strategy.split(input, config);
		const chunkingMetadata = strategy.createMetadata(config);

		return drafts.map((draft, ordinal) => ({
			...draft,
			ordinal,
			chunkingMetadata: { ...chunkingMetadata },
		}));
	}
}
