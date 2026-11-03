// Reference: https://github.com/betta-tech/byo-coding-agent/blob/main/internal/memory/store.go

export enum MEMORY_TYPE {
	FACT = 'FACT', // RAG
	DECISION = 'DECISION', // Append only episodic memory
	SESSION_SUMMARY = 'SESSION_SUMMARY', // Session log
	PREFERENCE = 'PREFERENCE', // Always updated file, summary of chunks
}

export type MemoryFragment = {
	created: Date;
	type: MEMORY_TYPE; // Decides where this should go
	content: string;
	tags: string[]; // Used for classification
	origin: 'system' | 'user';
	additionalContext?: Record<string, unknown>;
};

export type PreferenceGroupIndexEntry = {
	group: string;
	created: string;
	updated: string;
	tags: string[];
	origin: 'system' | 'user';
	filePaths: string[];
};

export type MemoryRetrievalContext = {
	context: {
		query: string;
		recentContext?: string;
		activeGoal?: string;
	};
	filters?: {
		types?: MEMORY_TYPE[];
		tags?: string[];
		from?: Date;
		to?: Date;
		scopeId?: string;
	};
	limit?: number;
};
