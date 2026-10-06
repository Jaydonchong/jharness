import { LanguageModel } from "ai";
import { VercelSDK, VERCEL_AI_MODELS } from "../network/llmProviders/vercelSDK";
import { IConversationalAgent, ModelConversationMessage } from "./Interfaces";
import { GcalGetCalendarEventsTool } from "../tools/GcalTools";

export class AGcalSummarizer extends VercelSDK implements IConversationalAgent {
    constructor(
        private readonly model: LanguageModel = VERCEL_AI_MODELS.DEFAULT,
        private readonly gcalGetCalendarEventsTool: GcalGetCalendarEventsTool,
    ) {
        super();
    }
    async sendMessages(
        messages: ModelConversationMessage[],
    ): Promise<ModelConversationMessage[]> {
        const _SYSTEM_PROMPT = `
        You are a schedule manager, your job is to list down what are the events in my gcal that I have when asked
    `;
        const response = await super.generateText({
            config: {
                model: this.model,
                systemPrompt: _SYSTEM_PROMPT,
                availableTools: [this.gcalGetCalendarEventsTool],
            },
            messages,
        });
        return response.messages;
    }
}
