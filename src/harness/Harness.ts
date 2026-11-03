import { AbstractAgentConfig } from '../agent/agentConfig/AbstractAgentConfig';
import { ModelConversationMessage } from '../agent/agentConfig/Interfaces';
import { CompactionEngine } from '../compaction/core/CompactionEngine';
import { ContextAssembler } from '../memory/core/ContextAssembler';
import { ILlmProvider } from '../providers/Interfaces';
import { ToolInvoker } from '../tools/core/ToolInvoker';
import logger from '../utils/Logger';
import Uuidv4Generator from '../utils/Uuidv4Generator';
import { AgentSession } from './AgentSession';
import { AgentSessionLogger } from './AgentSessionLogger';
import { SessionState } from './SessionState';

export type IHarnessDeps = {
	compactionEngine: CompactionEngine;
	contextAssembler: ContextAssembler;
};

export class Harness {
	public agentSessions: AgentSession<unknown>[] = [];
	public agentSessionRegistry: Map<string, AgentSession<unknown>> = new Map();
	private readonly sessionLogger: AgentSessionLogger;

	public constructor(private readonly deps: IHarnessDeps) {
		this.sessionLogger = new AgentSessionLogger();
	}

	public async close(): Promise<void> {
		await this.sessionLogger.close();
	}

	public getSession(id: string) {
		return this.agentSessionRegistry.get(id);
	}

	public async doCompaction(
		messages: ModelConversationMessage[],
		_conversationCheckpoint: string,
		agent: AbstractAgentConfig,
	): Promise<{
		compactedMessaage: string;
		retainedMessages: ModelConversationMessage[];
	}> {
		logger.info('Performing compaction');
		const compactionResult = await this.deps.compactionEngine.compactConversation({
			systemPrompt: agent.systemPrompt,
			messages,
			config: {
				factor: 0.3,
			},
		});
		logger.info('Compaction done');

		return {
			compactedMessaage: `\n${compactionResult.compacted}\n`,
			retainedMessages: compactionResult.recentMessage,
		};
	}

	public newSession<TModelType>(args: {
		llmProvider: ILlmProvider<TModelType>;
		agent: AbstractAgentConfig;
		model: TModelType;
	}): AgentSession<TModelType> {
		const sessionId = Uuidv4Generator.generateUuid();
		this.sessionLogger.createSession(sessionId);
		const sessionState = new SessionState(() => {});
		const session = new AgentSession({
			id: sessionId,
			llmProvider: args.llmProvider,
			agent: args.agent,
			model: args.model,
			compactionStrategy: this.doCompaction.bind(this),
			onNewSessionStart: (input) => this.deps.contextAssembler.prepareSessionContext(input),
			onSessionEvent: (eventType, context) =>
				this.sessionLogger.onSessionEvent(sessionId, eventType, context),
			sessionLogger: this.sessionLogger,
			sessionState,
		});
		this.agentSessions.push(session);
		this.agentSessionRegistry.set(session.id, session);
		return session;
	}
}
