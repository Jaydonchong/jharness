import { LanguageModel } from "ai";
import { VercelSDK, VERCEL_AI_MODELS } from "../network/llmProviders/VercelSDK";
import { IConversationalAgent, ModelConversationMessage } from "./Interfaces";
import { GcalGetCalendarEventsTool } from "../tools/GcalTools";
import { AbstractAgent } from "./AbstractAgent";

const timeZone = "Asia/Kuala_Lumpur";
const today = () =>
    new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone,
    }).format(new Date());

const SYSTEM_PROMPT = `
    You are a schedule manager, your job is to list down what are the events in my gcal that I have when asked.  
    When a month or year is not given in the prompt
    `;
export class AGcalSummarizer extends AbstractAgent {
    constructor(gcalGetCalendarEventsTool: GcalGetCalendarEventsTool) {
        super({
            systemPrompt: SYSTEM_PROMPT,
            agentTools: [gcalGetCalendarEventsTool],
            onMessage: async (msg: string) => {
                return Promise.resolve(
                    `now:  ${today()} in ${timeZone}
                    
                    ${msg}
                    `,
                );
            },
        });
    }
}
