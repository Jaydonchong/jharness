import { AbstractAgentConfig } from '../../agent/agentConfig/AbstractAgentConfig';
import { ModelConversationMessage } from '../../agent/agentConfig/Interfaces';
import { ToolInvoker } from '../../tools/core/ToolInvoker';
import type { IToolInvocationLogger } from '../../tools/core/ToolInvoker';
import logger from '../../utils/Logger';
import { DomainError, ErrorCode } from '../../utils/ErrorCode';
import { SessionState, SessionStatus, type InterruptionDetails } from './SessionState';
import { AgentConversation } from '../../agent/core/AgentConversation';
import type { AgentConversationCompactor } from '../../agent/core/AgentConversation';
import type { CompactionTokenStats } from '../../compaction/core/Interfaces';
import { AgentLoop } from '../../agent/core/AgentLoop';
import type { AgentTurnStrategy, ISessionResult } from '../../agent/core/AgentLoop';
import { ILlmProvider } from '../../providers/Interfaces';
import { getActiveSpan, getMeter } from '../../telemetry/Telemetry';
import { TraceScope, WithSpan } from '../../telemetry/Decorators';
import { Counter, Histogram } from '@opentelemetry/api';

export type TSessionMessageContent =
	| string
	// This is adapter from Vercel's ContentPart Type
	| {
			type: 'text';
			text: string;
	  }[];

type AgentSessionProps<TModelType> = {
	id: string;
	llmProvider: ILlmProvider<unknown>;
	agent: AbstractAgentConfig;
	model: TModelType;
	compactionStrategy: AgentConversationCompactor;
	onNewSessionStart: (input: { systemPrompt: string; userPrompt: string }) => Promise<string>;
	onSessionEvent: (eventType: AgentSessionEventType, context: AgentSessionEventContext) => void;
	sessionLogger: IToolInvocationLogger;
	sessionState: SessionState;
};

export enum AgentSessionEventType {
	SESSION_START = 'session_start',
	SESSION_MODEL = 'session_model',
	SYSTEM_MESSAGE = 'system_message',
	USER_MESSAGE = 'user_message',
	ASSISTANT_MESSAGE = 'assistant_message',
	COMPACTION = 'compaction',
	SESSION_ERROR = 'session_error',
	SESSION_TIMEOUT = 'session_timeout',
	TOOL_CALL = 'tool_call',
	TOOL_RESULT = 'tool_result',
}

export type AgentSessionEventContext = {
	provider?: string;
	model?: string;
	message?: string;
	toolId?: string;
	toolName?: string;
	input?: unknown;
	output?: unknown;
	compactionStats?: CompactionTokenStats;
};

@TraceScope('agent-session')
export class AgentSession<TModelType> {
	private readonly conversation = new AgentConversation();
	private _sessionContext: string | null = null;
	private readonly generateStrategy: AgentTurnStrategy<TModelType, never>;
	private readonly streamStrategy: AgentTurnStrategy<TModelType, string>;
	private readonly toolInvoker: ToolInvoker;
	private readonly agentLoop: AgentLoop<TModelType>;

	private readonly agentLoopMeter = getMeter('agent-session');

	private readonly agentTurnCounter: Counter = this.agentLoopMeter.createCounter(
		'agent-session.turns.count',
		{
			description: 'Number of agent turn attempts',
			unit: '1',
		},
	);

	private readonly agentTurnDuration: Histogram = this.agentLoopMeter.createHistogram(
		'agent-session.turn.duration',
		{
			description: 'Duration of agent turns',
			unit: 's',
		},
	);

	constructor(private readonly props: AgentSessionProps<TModelType>) {
		const llmProvider = this.llmProvider;
		this.generateStrategy = {
			async *runStep(input) {
				return await llmProvider.generateText(input);
			},
		};
		this.streamStrategy = {
			async *runStep(input) {
				const stream = await llmProvider.streamText(input);
				let reply = '';
				for await (const chunk of stream.reply) {
					reply += chunk;
					yield chunk;
				}

				const completed = await stream.completed;
				return {
					...completed,
					reply,
				};
			},
		};
		this.emitSessionEvent(AgentSessionEventType.SESSION_START, {});
		this.emitSessionEvent(AgentSessionEventType.SESSION_MODEL, {
			provider: this.llmProvider.constructor.name,
			model: getModelName(this.props.model),
		});
		this.toolInvoker = new ToolInvoker(
			this.agent,
			{ sessionId: this.id },
			this.props.sessionLogger,
		);
		this.agentLoop = new AgentLoop(
			this.conversation,
			this.toolInvoker,
			() => this.getProviderConfig(),
			{
				onProviderCall: () => this.props.sessionState.transitionTo(SessionStatus.REASONING),
				onToolCall: () => this.props.sessionState.transitionTo(SessionStatus.TOOL),
				onTurnComplete: () => this.props.sessionState.transitionTo(SessionStatus.WAITING),
				onTurnInterrupted: (details) => this.props.sessionState.interrupt(details),
				onSessionError: (message) =>
					this.emitSessionEvent(AgentSessionEventType.SESSION_ERROR, { message }),
				onSessionTimeout: (message) =>
					this.emitSessionEvent(AgentSessionEventType.SESSION_TIMEOUT, { message }),
				onAssistantMessage: (assistantMessage) =>
					this.emitSessionEvent(AgentSessionEventType.ASSISTANT_MESSAGE, {
						message: assistantMessage,
					}),
				onWarning: (message, context) => logger.warn(message, context),
				onError: (message) => logger.error(message),
			},
		);
	}

	public get messages(): ModelConversationMessage[] {
		return this.conversation.messages;
	}

	public set messages(messages: ModelConversationMessage[]) {
		this.conversation.replaceMessages(messages);
	}

	public get id() {
		return this.props.id;
	}

	public get llmProvider() {
		return this.props.llmProvider;
	}

	public get agent() {
		return this.props.agent;
	}

	public get state(): SessionStatus {
		return this.props.sessionState.currentState;
	}

	public get interruptedStreamAttempt(): Readonly<InterruptionDetails> | null {
		return this.props.sessionState.interruptedStreamAttempt;
	}

	public async compactConversation(): Promise<CompactionTokenStats | null> {
		if (this.state === SessionStatus.START) return null;

		this.props.sessionState.transitionTo(SessionStatus.COMPACTING);
		const currentMessage = this.conversation.currentMessage;
		try {
			const result = await this.conversation.compact(
				this.props.compactionStrategy,
				this.agent,
				this.getSessionSystemPrompt(),
			);
			this.emitSessionEvent(AgentSessionEventType.COMPACTION, {
				message:
					typeof currentMessage?.content === 'string'
						? currentMessage.content
						: undefined,
				compactionStats: result.tokenStats,
			});
			return result.tokenStats;
		} finally {
			this.props.sessionState.transitionTo(SessionStatus.WAITING);
		}
	}

	private emitSessionEvent(
		eventType: AgentSessionEventType,
		context: AgentSessionEventContext,
	): void {
		try {
			this.props.onSessionEvent(eventType, context);
		} catch (error) {
			logger.error('Unable to queue session log event', { error });
		}
	}

	private getSessionSystemPrompt(): string {
		return [this.agent.systemPrompt, this._sessionContext]
			.filter((context): context is string => Boolean(context))
			.join('\n');
	}

	private getProviderSystemPrompt(): string {
		return this.conversation.buildProviderSystemPrompt(this.getSessionSystemPrompt());
	}

	private async initSessionCheck(message: string) {
		if (this.state !== SessionStatus.START && this.state !== SessionStatus.INITIALIZING) return;
		if (this.state === SessionStatus.INITIALIZING) {
			throw new DomainError(
				ErrorCode.VALIDATION_ERROR,
				'Session initialization is already in progress',
			);
		}
		this.props.sessionState.transitionTo(SessionStatus.INITIALIZING);
		try {
			this._sessionContext = await this.props.onNewSessionStart({
				systemPrompt: this.agent.systemPrompt,
				userPrompt: message,
			});
			this.emitSessionEvent(AgentSessionEventType.SYSTEM_MESSAGE, {
				message: this.getSessionSystemPrompt(),
			});
		} catch (error) {
			this.props.sessionState.transitionTo(SessionStatus.START);
			throw error;
		}
		this.props.sessionState.transitionTo(SessionStatus.WAITING);
	}

	@WithSpan({
		name: 'agent-session.turn',
		attributes: (session) => (session as AgentSession<unknown>).getTurnSpanAttributes(),
	})
	public async sendMessage(message: string): Promise<ISessionResult> {
		const attributes = getAgentTelemetryAttributes(this.props.model, this.agent);
		const startedAt = performance.now();
		try {
			const turn = this.runTurn(message, this.generateStrategy);
			let result = await turn.next();

			while (!result.done) {
				result = await turn.next();
			}

			return result.value;
		} finally {
			this.agentTurnCounter.add(1, attributes);
			this.agentTurnDuration.record((performance.now() - startedAt) / 1000, attributes);
		}
	}

	@WithSpan({
		name: 'agent-session.turn',
		attributes: (session) => (session as AgentSession<unknown>).getTurnSpanAttributes(),
	})
	public async *streamMessage(message: string): AsyncGenerator<string, ISessionResult> {
		const attributes = getAgentTelemetryAttributes(this.props.model, this.agent);
		const span = getActiveSpan();
		const startedAt = performance.now();
		let outcome: 'success' | 'error' | 'cancelled' = 'cancelled';

		try {
			const result = yield* this.runTurn(message, this.streamStrategy);
			outcome = 'success';
			return result;
		} catch (error) {
			outcome = 'error';
			throw error;
		} finally {
			const turnAttributes = { ...attributes, 'agent.turn.outcome': outcome };
			span?.setAttribute('agent.turn.outcome', outcome);
			this.agentTurnCounter.add(1, turnAttributes);
			this.agentTurnDuration.record((performance.now() - startedAt) / 1000, turnAttributes);
		}
	}

	private getTurnSpanAttributes() {
		return {
			...getAgentTelemetryAttributes(this.props.model, this.agent),
			'gen_ai.agent.version': this.agent.version,
		};
	}

	private async *runTurn<TChunk extends string>(
		message: string,
		strategy: AgentTurnStrategy<TModelType, TChunk>,
	): AsyncGenerator<TChunk, ISessionResult> {
		await this.prepareTurn(message);
		return yield* this.agentLoop.run(message, strategy);
	}

	private async prepareTurn(message: string): Promise<void> {
		await this.initSessionCheck(message);
		const sanitizedMessage = await this.agent.onMessage(message);
		this.emitSessionEvent(AgentSessionEventType.USER_MESSAGE, { message });
		this.conversation.append({ role: 'user', content: sanitizedMessage });
	}

	private getProviderConfig() {
		return {
			model: this.props.model,
			systemPrompt: this.getProviderSystemPrompt(),
			availableTools: this.agent.agentTools,
			outputSchema: this.agent.outputSchema,
		};
	}
}

function getModelName(model: unknown): string {
	if (typeof model === 'string') return model;
	if (
		typeof model === 'object' &&
		model !== null &&
		'modelId' in model &&
		typeof model.modelId === 'string'
	) {
		return model.modelId;
	}
	return String(model);
}

function getProviderName(model: unknown): string {
	if (
		typeof model === 'object' &&
		model !== null &&
		'provider' in model &&
		typeof model.provider === 'string'
	) {
		return model.provider;
	}
	if (typeof model === 'string' && model.includes('/')) {
		return model.split('/', 1)[0];
	}
	return 'unknown';
}

function getAgentTelemetryAttributes(model: unknown, agent: AbstractAgentConfig) {
	return {
		'gen_ai.provider.name': getProviderName(model),
		'gen_ai.agent.name': agent.name,
		'gen_ai.request.model': getModelName(model),
	};
}
