import { AbstractAgent } from "../agents/AbstractAgent";
import { ILlmProvider } from "../network/llmProviders/Interfaces";
import Uuidv4Generator from "../utils/Uuidv4Generator";
import { AgentSession } from "./AgentSession";

/**
 * 1. Compaction
 * 2. Memory
 */

export class Harness {
    public agentSessions: AgentSession<unknown>[] = [];
    public agentSessionRegistry: Map<string, AgentSession<unknown>> = new Map();

    public getSession(id: string) {
        return this.agentSessionRegistry.get(id);
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
        });
        this.agentSessions.push(session);
        this.agentSessionRegistry.set(session.id, session);
        return session;
    }
}
