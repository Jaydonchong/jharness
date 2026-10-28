import { AbstractAgent } from "../agents/AbstractAgent";
import { ILlmProvider } from "../network/llmProviders/Interfaces";
import Uuidv4Generator from "../utils/Uuidv4Generator";
import { AgentSession } from "./AgentSession";

/**
 * TODO
 * 1. Tool Loop
 * 2. Compaction
 * 3. Memory
 * 4. RAG
 * 5. Evals
 * 6. Hooks + Permissions
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
