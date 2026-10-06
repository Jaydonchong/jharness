import {
    IConversationalAgent,
    ModelConversationMessage,
} from "../agents/Interfaces";

export type TSessionMessageContent =
    | string
    // This is adapter from Vercel's ContentPart Type
    | {
          type: "text";
          text: string;
      }[];

/**
 * TODO: Make Harness Class + Harness should Handle Model Messagae
 */
export class AgentSession {
    public messages: ModelConversationMessage[] = [];
    constructor(private readonly agent: IConversationalAgent) {}

    public async sendMessage(
        message: string,
    ): Promise<ModelConversationMessage[]> {
        this.messages.push({ role: "user", content: message });
        const response = await this.agent.sendMessages(this.messages);
        if (response.length < 0)
            throw ErrorCode.AI_MODEL_UNEXPECTED_MISSING_RESPONSE;

        this.messages.push(...response);
        return response;
    }
}
