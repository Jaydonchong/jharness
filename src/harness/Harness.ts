import { AbstractAgent } from "../agents/AbstractAgent";
import { ModelConversationMessage } from "../agents/Interfaces";
import { CompactionEngine } from "../compaction/core/CompactionEngine";
import { ILlmProvider } from "../providers/Interfaces";
import logger from "../utils/Logger";
import Uuidv4Generator from "../utils/Uuidv4Generator";
import { AgentSession } from "./AgentSession";

/**
 * TODO
 * - [x] Manual Tool Loop
 * - [x] Compaction
 * - [] Memory
 * - [] RAG
 * - [] Evals
 * - [] Hooks + Permissions
 * - [] Permission Gates
 */

export type IHarnessDeps = {
    compactionEngine: CompactionEngine;
};

export class Harness {
    public agentSessions: AgentSession<unknown>[] = [];
    public agentSessionRegistry: Map<string, AgentSession<unknown>> = new Map();

    public constructor(private readonly deps: IHarnessDeps) {}

    public getSession(id: string) {
        return this.agentSessionRegistry.get(id);
    }

    public async doCompaction(
        messages: ModelConversationMessage[],
        _conversationCheckpoint: string,
        agent: AbstractAgent,
    ): Promise<{
        compactedMessaage: string;
        retainedMessages: ModelConversationMessage[];
    }> {
        logger.info("Performing compaction");
        const compactionResult =
            await this.deps.compactionEngine.compactConversation({
                systemPrompt: agent.systemPrompt,
                messages,
                config: {
                    factor: 0.3,
                },
            });
        logger.info("Compaction done");

        return {
            compactedMessaage: `\n${compactionResult.compacted}\n`,
            retainedMessages: compactionResult.recentMessage,
        };
    }

    public newSession<TModelType>(args: {
        llmProvider: ILlmProvider<TModelType>;
        agent: AbstractAgent;
        model: TModelType;
    }): AgentSession<TModelType> {
        const session = new AgentSession({
            id: Uuidv4Generator.generateUuid(),
            llmProvider: args.llmProvider,
            agent: args.agent,
            model: args.model,
            onCompact: this.doCompaction.bind(this),
        });
        this.agentSessions.push(session);
        this.agentSessionRegistry.set(session.id, session);
        return session;
    }
}
