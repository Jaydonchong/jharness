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
    }

    private async startNewSession(userPrompt: string): Promise<void> {
        if (this._sessionContext !== null) return;

        this._sessionContext = await this.props.onNewSessionStart({
            systemPrompt: this.agent.systemPrompt,
            userPrompt,
        });
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
        await this.startNewSession(message);

        // Prepare dynamic message
        const sanitizedMessage = await this.agent.onMessage(message);
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
                } catch (error) {
                    retries++;
                }
                break;
            }

            if (retries >= MAX_RETRY_PER_STEP || response == null) {
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
                throw new DomainError(
                    ErrorCode.AI_PROVIDER_RESPONSE_ERROR,
                    "Tool call stop reason without any tool call",
                );
            }
            const toolCallResults = await this.toolInvoker.invoke(
                response.toolCalls,
            );
            this.messages.push(toolCallResults);
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
        if (response.messages.length === 0 && response.reply.length === 0) {
            throw new DomainError(
                ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
                "Model returned no messages or reply",
            );
        }
    }

    public async *streamMessage(message: string): AsyncGenerator<string> {
        await this.startNewSession(message);
        this.messages.push({ role: "user", content: message });

        // Loop
        const MAX_ITERATION = 10;
        let iteration = 0;
        let stopReason: LlmTextStopReason = LlmTextStopReason.TOOL_CALL;
        while (
            stopReason === LlmTextStopReason.TOOL_CALL &&
            iteration < MAX_ITERATION
        ) {
            const response = await this.llmProvider.streamText({
                config: {
                    model: this.props.model,
                    systemPrompt: this.getSessionSystemPrompt(),
                    availableTools: this.agent.agentTools,
                    outputSchema: this.agent.outputSchema,
                },
                messages: this.messages,
            });

            for await (const chunk of response.reply) {
                yield chunk;
            }

            const completed = await response.completed;
            stopReason = completed.stopReason;

            if (stopReason === LlmTextStopReason.STOP) return;

            if (stopReason !== LlmTextStopReason.TOOL_CALL) {
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
