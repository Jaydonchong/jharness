import { AbstractAgent } from "../agents/AbstractAgent";
import {
    IConversationalAgent,
    ModelConversationMessage,
} from "../agents/Interfaces";
import {
    ILlmGenerateTextOutput,
    ILlmProvider,
    LlmTextStopReason,
} from "../network/llmProviders/Interfaces";
import logger from "../utils/Logger";

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
    agent: AbstractAgent; //TODO: General Purpose Agent
    model: TModelType;
};

/**
 * 1. Track Message History
 *
 */
export class AgentSession<TModelType> {
    public messages: ModelConversationMessage[] = [];

    constructor(private readonly props: AgentSessionProps<TModelType>) {}

    public get id() {
        return this.props.id;
    }

    public get llmProvider() {
        return this.props.llmProvider;
    }

    public get agent() {
        return this.props.agent;
    }

    public async sendMessage(message: string): Promise<string> {
        this.messages.push({ role: "user", content: message });

        // Loop
        const MAX_ITERATION = 10;
        let iteration = 0;
        let response: ILlmGenerateTextOutput | null = null;
        let stopReason: LlmTextStopReason = LlmTextStopReason.TOOL_CALL;
        while (
            stopReason == LlmTextStopReason.TOOL_CALL &&
            iteration < MAX_ITERATION
        ) {
            response = await this.llmProvider.generateText({
                config: {
                    model: this.props.model,
                    systemPrompt: this.agent.systemPrompt,
                    availableTools: this.agent.agentTools,
                },
                messages: this.messages,
            });

            this._validateResponse(response);

            stopReason = response.stopReason;

            this.messages.push(...response.messages);
            iteration++;
        }
        if (iteration >= MAX_ITERATION) {
            logger.error("Max iteration reached, stopping loop");
            throw new Error(`${ErrorCode.MAX_AGENT_LOOP_ITERATION_REACHED}`);
        }

        if (!response) {
            logger.error("Empty response");
            throw new Error(
                `${ErrorCode.AI_MODEL_UNEXPECTED_MISSING_RESPONSE} Empty non tool-call response`,
            );
        }
        if (response.stopReason == LlmTextStopReason.STOP) {
            return response.reply;
        }
        //TODO: Handle other stop reason
        logger.warn("Unhandled response", response);
        throw new Error(`${ErrorCode.NOT_IMPLEMENTED} Unexpected stop`);
    }

    private _validateResponse(response: ILlmGenerateTextOutput) {
        if (response.messages.length < 0 || response.reply.length < 0)
            throw new Error(ErrorCode.AI_MODEL_UNEXPECTED_MISSING_RESPONSE);
    }
}
