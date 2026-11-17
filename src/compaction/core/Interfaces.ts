import { ModelConversationMessage } from '@agent/agentConfig/Interfaces';

export type CompactionInput = {
	systemPrompt: string;
	comparisonSystemPrompt?: string;
	conversationCheckpoint?: string;
	originalTokenCount?: number;
	messages: ModelConversationMessage[];
	config: {
		factor: number; // Maximum summary-to-original-context token ratio, from 0 (exclusive) to 1
	};
};

export type CompactionTokenStats = {
	beforeTokens: number;
	afterTokens: number;
	tokensSaved: number;
	reductionPercent: number | null;
};

export type CompactionOutput = {
	input: CompactionInput;
	recentMessages: ModelConversationMessage[]; //Recent messages that are preserved
	compactedResult: ModelConversationMessage[];
};

export const createEmptyCompactionOutput = (input: CompactionInput): CompactionOutput => {
	return {
		input,
		recentMessages: [],
		compactedResult: [],
	};
};
