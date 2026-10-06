import { LanguageModel, ModelMessage } from "ai";
import { VercelSDK, VERCEL_AI_MODELS } from "../network/aiModel/vercelSDK";
import { IConversationalAgent, ModelConversationMessage } from "./Interfaces";
import { AgentTool } from "../tools/AgentTool";
import { GcalGetCalendarEventsTool } from "../tools/GcalTools";

export class AGcalSummarizer extends VercelSDK implements IConversationalAgent {
    constructor(
        model: LanguageModel = VERCEL_AI_MODELS.DEFAULT,
        private readonly gcalGetCalendarEventsTool: GcalGetCalendarEventsTool,
    ) {
        const _SYSTEM_PROMPT = `
        You are a schedule manager, your job is to list down what are the events in my gcal that I have when asked
    `;
        super(_SYSTEM_PROMPT, model);
    }
    async sendMessages(
        messages: ModelConversationMessage[],
    ): Promise<ModelConversationMessage[]> {
        return await super.promptMessage(messages, [
            this.gcalGetCalendarEventsTool,
        ]);
    }
}
