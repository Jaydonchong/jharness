import { AbstractAgent } from "../agents/AbstractAgent";
import {
    IConversationalAgent,
    ModelConversationMessage,
} from "../agents/Interfaces";
import { ILlmProvider } from "../network/llmProviders/Interfaces";

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
        const response = await this.llmProvider.generateText({
            config: {
                model: this.props.model,
                systemPrompt: this.agent.systemPrompt,
                availableTools: this.agent.agentTools,
            },
            messages: this.messages,
        });

        // const response = await this.agent.sendMessages(this.messages);
        if (response.messages.length < 0 || response.reply.length < 0)
            throw ErrorCode.AI_MODEL_UNEXPECTED_MISSING_RESPONSE;

        this.messages.push(...response.messages);
        return response.reply;
    }
}
