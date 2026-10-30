import { AbstractAgent } from "../agents/AbstractAgent";
import { ModelConversationMessage } from "../agents/Interfaces";
import { ToolInvoker } from "../tools/core/ToolInvoker";
import logger from "../utils/Logger";
import { DomainError, ErrorCode } from "../utils/ErrorCode";
import {
    ILlmGenerateTextOutput,
    ILlmProvider,
    LlmTextStopReason,
} from "../providers/Interfaces";

export type TSessionMessageContent =
    | string
    // This is adapter from Vercel's ContentPart Type
    | {
          type: "text";
          text: string;
      }[];

type AgentSessionProps<TModelType> = {
    id: string;
    llmProvider: ILlmProvider<unknown>;
    agent: AbstractAgent;
    model: TModelType;
    /**
     *
     * Separate compaction result here because compacted messages are injected
     * into systemp prompt post compaction, but should not be preserved in future compaction
     */
    onCompact: (
        messages: ModelConversationMessage[],
        _conversationCheckpoint: string,
        agent: AbstractAgent,
    ) => Promise<{
        compactedMessaage: string;
        retainedMessages: ModelConversationMessage[];
    }>;
    onNewSessionStart: (input: {
        systemPrompt: string;
        userPrompt: string;
    }) => Promise<string>;
    onSessionEvent: (
        eventType: AgentSessionEventType,
        context: AgentSessionEventContext,
    ) => void;
};

export enum AgentSessionEventType {
    SESSION_START = "session_start",
    SESSION_MODEL = "session_model",
    USER_MESSAGE = "user_message",
    ASSISTANT_MESSAGE = "assistant_message",
    COMPACTION = "compaction",
    SESSION_ERROR = "session_error",
    SESSION_TIMEOUT = "session_timeout",
    TOOL_CALL = "tool_call",
    TOOL_RESULT = "tool_result",
}

export type AgentSessionEventContext = {
    provider?: string;
    model?: string;
    message?: string;
    systemPrompt?: string;
    toolId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
};

export interface ISessionResult {
    reply: string;
    output?: unknown;
}

/**
 * 1. Track Message History
 *
 */

const MAX_AGENT_LOOP_STEP = 10;
const MAX_RETRY_PER_STEP = 3; // Note: retries do not count into agent loop step.

export class AgentSession<TModelType> {
    public messages: ModelConversationMessage[] = [];
    /**
     * Compaction result
     */
    private _conversationCheckpoint: string = "";
    private _sessionContext: string | null = null;
    private _sessionStartPromise: Promise<void> | null = null;
    private _sessionEventsStarted = false;
    private readonly toolInvoker: ToolInvoker;

    constructor(private readonly props: AgentSessionProps<TModelType>) {
        this.toolInvoker = new ToolInvoker(this.agent, { sessionId: this.id });
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

    public async compactConversation() {
        const compactedConversation = await this.props.onCompact(
            this.messages,
            this._conversationCheckpoint,
            this.agent,
        );
        this._conversationCheckpoint = compactedConversation.compactedMessaage;
        this.messages = compactedConversation.retainedMessages;
        this.emitSessionEvent(AgentSessionEventType.COMPACTION, {});
    }

    private async startNewSession(userPrompt: string): Promise<boolean> {
        if (this._sessionContext !== null) return false;
        if (this._sessionStartPromise !== null) {
            await this._sessionStartPromise;
            return false;
        }

        if (!this._sessionEventsStarted) {
            this.emitSessionEvent(AgentSessionEventType.SESSION_START, {});
            this.emitSessionEvent(AgentSessionEventType.SESSION_MODEL, {
                provider: this.llmProvider.constructor.name,
                model: getModelName(this.props.model),
            });
            this._sessionEventsStarted = true;
        }
        this._sessionStartPromise = (async () => {
            this._sessionContext = await this.props.onNewSessionStart({
                systemPrompt: this.agent.systemPrompt,
                userPrompt,
            });
        })();
        try {
            await this._sessionStartPromise;
        } catch (error) {
            this._sessionStartPromise = null;
            throw error;
        }
        return true;
    }

    private emitSessionEvent(
        eventType: AgentSessionEventType,
        context: AgentSessionEventContext,
    ): void {
        try {
            this.props.onSessionEvent(eventType, context);
        } catch (error) {
            logger.error("Unable to queue session log event", { error });
        }
    }

    private getSessionSystemPrompt(): string {
        return [this.agent.systemPrompt, this._sessionContext]
            .filter((context): context is string => Boolean(context))
            .join("\n");
    }

    /**
     * We split conversation message from system prompt to make it easier
     * for conversation processes without affecting system prompt (i.e compaction)
     */
    public async sendMessage(message: string): Promise<ISessionResult> {
        const isFirstMessage = await this.startNewSession(message);

        // Prepare dynamic message
        const sanitizedMessage = await this.agent.onMessage(message);
        this.emitSessionEvent(AgentSessionEventType.USER_MESSAGE, {
            message: sanitizedMessage,
            ...(isFirstMessage
                ? { systemPrompt: this.getSessionSystemPrompt() }
                : {}),
        });
        this.messages.push({ role: "user", content: sanitizedMessage });

        // Loop
        let step = 0;
        let response: ILlmGenerateTextOutput | null = null;
        let stopReason: LlmTextStopReason = LlmTextStopReason.TOOL_CALL;
        while (step < MAX_AGENT_LOOP_STEP) {
            let retries = 0;

            while (retries < MAX_RETRY_PER_STEP) {
                try {
                    response = await this.llmProvider.generateText({
                        config: {
                            model: this.props.model,
                            systemPrompt: [
                                this.getSessionSystemPrompt(),
                                this._conversationCheckpoint,
                            ]
                                .filter(Boolean)
                                .join("\n"),
                            availableTools: this.agent.agentTools,
                            outputSchema: this.agent.outputSchema,
                        },
                        messages: this.messages,
                    });
                    this._validateResponse(response);
                    break;
                } catch (error) {
                    retries++;
                    this.emitSessionEvent(AgentSessionEventType.SESSION_ERROR, {});
                }
            }

            if (retries >= MAX_RETRY_PER_STEP || response == null) {
                if (retries >= MAX_RETRY_PER_STEP) {
                    this.emitSessionEvent(
                        AgentSessionEventType.SESSION_TIMEOUT,
                        {},
                    );
                }
                throw new DomainError(
                    ErrorCode.AI_PROVIDER_RESPONSE_ERROR,
                    "Unable to send request to provider",
                );
            }

            stopReason = response.stopReason;
            step++;

            this.messages.push(...response.messages);

            if (stopReason !== LlmTextStopReason.TOOL_CALL) break;

            // Tool invocation steps, hand rolled
            // Enhancement:
            // can be offloaded into a queue/runner pattern in the future
            // Optional (Tool call preservation)
            if (!response.toolCalls?.length) {
                this.emitSessionEvent(AgentSessionEventType.SESSION_ERROR, {});
                throw new DomainError(
                    ErrorCode.AI_PROVIDER_RESPONSE_ERROR,
                    "Tool call stop reason without any tool call",
                );
            }
            const toolResultContent: Record<string, unknown>[] = [];
            for (const toolCall of response.toolCalls) {
                this.emitSessionEvent(AgentSessionEventType.TOOL_CALL, {
                    toolId: toolCall.id,
                    toolName: toolCall.name,
                    input: toolCall.input,
                });
                const toolResults = await this.toolInvoker.invoke([toolCall]);
                if (Array.isArray(toolResults.content)) {
                    const results = toolResults.content.filter(
                        (result): result is Record<string, unknown> =>
                            typeof result === "object" && result !== null,
                    );
                    this.emitToolResultEvents(results);
                    toolResultContent.push(...results);
                }
            }
            this.messages.push({ role: "tool", content: toolResultContent });
        }

        if (step >= MAX_AGENT_LOOP_STEP) {
            logger.error("Max iteration reached, stopping loop");
            throw new DomainError(
                ErrorCode.MAX_AGENT_LOOP_ITERATION_REACHED,
                "Agent loop reached its iteration limit",
            );
        }

        if (response == null) {
            logger.error("Empty response");
            throw new DomainError(
                ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
                "Agent loop received no response",
            );
        }

        if (response.stopReason === LlmTextStopReason.STOP) {
            this.emitSessionEvent(AgentSessionEventType.ASSISTANT_MESSAGE, {
                message: response.reply,
            });
            return { reply: response.reply, output: response.output };
        }

        //TODO: Handle other stop reason
        logger.warn("Unhandled response", response);
        throw new DomainError(
            ErrorCode.NOT_IMPLEMENTED,
            `Unhandled agent stop reason: ${response.stopReason}`,
        );
    }

    private _validateResponse(response: ILlmGenerateTextOutput) {
        if (response.stopReason === LlmTextStopReason.ERROR) {
            throw new DomainError(
                ErrorCode.AI_PROVIDER_RESPONSE_ERROR,
                "Provider returned an error response",
            );
        }
        if (response.messages.length === 0 && response.reply.length === 0) {
            throw new DomainError(
                ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
                "Model returned no messages or reply",
            );
        }
    }

    private emitToolEvents(messages: ModelConversationMessage[]): void {
        const toolNames = new Map<string, string>();
        for (const message of messages) {
            if (!Array.isArray(message.content)) continue;
            for (const part of message.content) {
                if (
                    typeof part === "object" &&
                    part !== null &&
                    part.type === "tool-call" &&
                    typeof part.toolCallId === "string" &&
                    typeof part.toolName === "string"
                ) {
                    toolNames.set(part.toolCallId, part.toolName);
                }
            }
        }

        for (const message of messages) {
            if (!Array.isArray(message.content)) continue;
            for (const part of message.content) {
                if (typeof part !== "object" || part === null) continue;
                if (part.type === "tool-call") {
                    if (
                        typeof part.toolCallId === "string" &&
                        typeof part.toolName === "string"
                    ) {
                        this.emitSessionEvent(AgentSessionEventType.TOOL_CALL, {
                            toolId: part.toolCallId,
                            toolName: part.toolName,
                            input: part.input,
                        });
                    }
                    continue;
                }

                if (
                    part.type === "tool-result" &&
                    typeof part.toolCallId === "string"
                ) {
                    this.emitToolResultEvents([
                        {
                            ...part,
                            toolName:
                                typeof part.toolName === "string"
                                    ? part.toolName
                                    : (toolNames.get(part.toolCallId) ??
                                      "unknown"),
                        },
                    ]);
                }
            }
        }
    }

    private emitToolResultEvents(results: Record<string, unknown>[]): void {
        for (const result of results) {
            if (
                typeof result.toolCallId !== "string" ||
                typeof result.toolName !== "string"
            ) {
                continue;
            }
            this.emitSessionEvent(AgentSessionEventType.TOOL_RESULT, {
                toolId: result.toolCallId,
                toolName: result.toolName,
                output: getToolOutput(result.output),
            });
        }
    }

    public async *streamMessage(message: string): AsyncGenerator<string> {
        const isFirstMessage = await this.startNewSession(message);
        this.emitSessionEvent(AgentSessionEventType.USER_MESSAGE, {
            message,
            ...(isFirstMessage
                ? { systemPrompt: this.getSessionSystemPrompt() }
                : {}),
        });
        this.messages.push({ role: "user", content: message });

        // Loop
        const MAX_ITERATION = 10;
        let iteration = 0;
        let assistantReply = "";
        let stopReason: LlmTextStopReason = LlmTextStopReason.TOOL_CALL;
        while (
            stopReason === LlmTextStopReason.TOOL_CALL &&
            iteration < MAX_ITERATION
        ) {
            let response;
            try {
                response = await this.llmProvider.streamText({
                    config: {
                        model: this.props.model,
                        systemPrompt: this.getSessionSystemPrompt(),
                        availableTools: this.agent.agentTools,
                        outputSchema: this.agent.outputSchema,
                    },
                    messages: this.messages,
                });

                for await (const chunk of response.reply) {
                    assistantReply += chunk;
                    yield chunk;
                }
            } catch (error) {
                this.emitSessionEvent(AgentSessionEventType.SESSION_ERROR, {});
                throw error;
            }

            let completed;
            try {
                completed = await response.completed;
            } catch (error) {
                this.emitSessionEvent(AgentSessionEventType.SESSION_ERROR, {});
                throw error;
            }
            stopReason = completed.stopReason;
            this.emitToolEvents(completed.messages);

            if (stopReason === LlmTextStopReason.STOP) {
                this.emitSessionEvent(AgentSessionEventType.ASSISTANT_MESSAGE, {
                    message: assistantReply,
                });
                return;
            }

            if (stopReason !== LlmTextStopReason.TOOL_CALL) {
                if (stopReason === LlmTextStopReason.ERROR) {
                    this.emitSessionEvent(
                        AgentSessionEventType.SESSION_ERROR,
                        {},
                    );
                }
                throw new DomainError(
                    ErrorCode.NOT_IMPLEMENTED,
                    `Unhandled agent stop reason :${stopReason}`,
                );
            }

            this.messages.push(...completed.messages);
            iteration++;
        }
        logger.error("Max iteration reached, stopping loop");
        throw new DomainError(
            ErrorCode.MAX_AGENT_LOOP_ITERATION_REACHED,
            "Agent loop reached its iteration limit",
        );
    }
}

function getModelName(model: unknown): string {
    if (typeof model === "string") return model;
    if (
        typeof model === "object" &&
        model !== null &&
        "modelId" in model &&
        typeof model.modelId === "string"
    ) {
        return model.modelId;
    }
    return String(model);
}

function getToolOutput(output: unknown): unknown {
    if (
        typeof output === "object" &&
        output !== null &&
        "value" in output
    ) {
        return output.value;
    }
    return output;
}
