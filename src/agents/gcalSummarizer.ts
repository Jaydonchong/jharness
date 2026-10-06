import { LanguageModel } from "ai";
import { VercelSDK, VERCEL_AI_MODELS } from "../network/llmProviders/vercelSDK";
import { IConversationalAgent, ModelConversationMessage } from "./Interfaces";
import { GcalGetCalendarEventsTool } from "../tools/GcalTools";
import { AbstractAgent } from "./agent";

const SYSTEM_PROMPT =
    "You are a schedule manager, your job is to list down what are the events in my gcal that I have when asked";
export class AGcalSummarizer extends AbstractAgent {
    constructor(
        private readonly model: LanguageModel = VERCEL_AI_MODELS.DEFAULT,
        gcalGetCalendarEventsTool: GcalGetCalendarEventsTool,
    ) {
        super({
            systemPrompt: SYSTEM_PROMPT,
            agentTools: [gcalGetCalendarEventsTool],
        });
    }
    // async sendMessages(
    //     messages: ModelConversationMessage[],
    // ): Promise<ModelConversationMessage[]> {
    //     const _SYSTEM_PROMPT = `
    //     You are a schedule manager, your job is to list down what are the events in my gcal that I have when asked
    // `;
    //     const response = await super.generateText({
    //         config: {
    //             model: this.model,
    //             systemPrompt: _SYSTEM_PROMPT,
    //             availableTools: [this.gcalGetCalendarEventsTool],
    //         },
    //         messages,
    //     });
    //     return response.messages;
    // }
}
