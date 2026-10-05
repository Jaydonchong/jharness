import {
    IConversationalAgent,
    ModelConversationMessage,
} from "../agents/Interfaces";

export class AgentSession {
    public messages: ModelConversationMessage[] = [];
    constructor(private readonly agent: IConversationalAgent) {}

    public async sendMessage(message: string): Promise<string> {
        this.messages.push({ role: "user", content: message });
        const response = await this.agent.sendMessages(this.messages);
        this.messages.push({ role: "assistant", content: response });
        return response;
    }
}
