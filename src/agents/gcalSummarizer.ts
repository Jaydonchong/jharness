import { LanguageModel } from "ai";
import { VercelSDK, VERCEL_AI_MODELS } from "../network/llmProviders/VercelSDK";
import { IConversationalAgent, ModelConversationMessage } from "./Interfaces";
import { GcalGetCalendarEventsTool } from "../tools/GcalTools";
import { AbstractAgent } from "./AbstractAgent";

const SYSTEM_PROMPT =
    "You are a schedule manager, your job is to list down what are the events in my gcal that I have when asked";
export class AGcalSummarizer extends AbstractAgent {
    constructor(gcalGetCalendarEventsTool: GcalGetCalendarEventsTool) {
        super({
            systemPrompt: SYSTEM_PROMPT,
            agentTools: [gcalGetCalendarEventsTool],
        });
    }
}
