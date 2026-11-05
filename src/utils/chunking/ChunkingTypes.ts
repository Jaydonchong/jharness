export type ChunkLocation = {
	startOffset: number;
	endOffset: number;
	page?: number;
	sectionPath?: string[];
};

export type ChunkingMetadata = {
	strategy: string;
	version: string;
	configHash?: string;
};

export type ChunkingInput = {
	content: string;
};

export type ChunkDraft = {
	content: string;
	location: ChunkLocation | null;
	metadata: Record<string, unknown>;
};

export type ChunkSegment = ChunkDraft & {
	ordinal: number;
	chunkingMetadata: ChunkingMetadata;
};

export type ChunkingConfig = {
	chunkSizeLimit: number;
	overlap: number;
};
