import { ModelConversationMessage } from '../../agent/agentConfig/Interfaces';

export type CompactionInput = {
	systemPrompt: string;
	messages: ModelConversationMessage[];
	config: {
		factor: number; // Compaction ratio 1-10 representing 0.1-1
	};
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
