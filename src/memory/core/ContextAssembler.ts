import { readFileSync } from "node:fs";
import { ModelConversationMessage } from "../../agents/Interfaces";
import { CompactionEngine } from "../../compaction/core/CompactionEngine";
import { AbstractMemoryStore } from "../memoryStore/AbstractMemoryStore";
import {
    MEMORY_TYPE,
    MemoryFragment,
    MemoryRetrievalContext,
    PreferenceGroupIndexEntry,
} from "./Interfaces";

type IContextAssemblerDeps = {
    memoryStore: AbstractMemoryStore;
    compactionEngine: CompactionEngine;
};

type IAssembledContext = {
    result: string;
};

/**
 * This design loads all preferences for now
 * It is not scalable and in the future it should have proper filters and reranking
 */

export class ContextAssembler {
    private readonly memoryInstructions: string;

    constructor(private readonly deps: IContextAssemblerDeps) {
        this.memoryInstructions = readFileSync(
            "src/memory/core/prompts/memory.md",
            "utf8",
        );
    }

    public async remember(memory: MemoryFragment): Promise<void> {
        await this.deps.memoryStore.store(memory);
    }

    public async recall(
        retrievalContext: MemoryRetrievalContext,
    ): Promise<Partial<MemoryFragment[]>> {
        return await this.deps.memoryStore.retrieve(retrievalContext);
    }

    public async listPreferenceGroups(): Promise<PreferenceGroupIndexEntry[]> {
        return this.deps.memoryStore.listPreferenceGroups();
    }

    public async prepareSessionContext(input: {
        systemPrompt: string;
        userPrompt: string;
    }): Promise<string> {
        const preferences = await this.recall({
            context: {
                query: input.userPrompt,
                recentContext: input.systemPrompt,
            },
            filters: {
                types: [MEMORY_TYPE.PREFERENCE],
            },
        });

        const preferenceMessages: ModelConversationMessage[] = preferences
            .filter(
                (preference): preference is MemoryFragment =>
                    preference !== undefined,
            )
            .map((preference) => ({
                role: preference.origin,
                content: JSON.stringify(preference),
            }));

        if (preferenceMessages.length === 0) {
            return this.memoryInstructions;
        }

        const compactedMemory = await this.deps.compactionEngine.compactMemory({
            systemPrompt: input.systemPrompt,
            messages: preferenceMessages,
            config: {
                factor: 0.3,
            },
        });

        return `${this.memoryInstructions}\n\n<memory>${compactedMemory}</memory>`;
    }

    private async retrieveDecisionLogs(
        context: MemoryRetrievalContext["context"],
    ): Promise<Partial<MemoryFragment[]>> {
        return await this.deps.memoryStore.retrieve({
            context,
            filters: {
                types: [MEMORY_TYPE.DECISION],
            },
        });
    }

    private async retrieveRecentSessionLogs(
        context: MemoryRetrievalContext["context"],
    ): Promise<Partial<MemoryFragment[]>> {
        return await this.deps.memoryStore.retrieve({
            context,
            filters: {
                types: [MEMORY_TYPE.SESSION_SUMMARY],
            },
        });
    }
}
