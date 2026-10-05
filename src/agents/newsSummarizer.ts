import { LanguageModel } from "ai";
import { VercelSDK, VERCEL_AI_MODELS } from "../network/aiModel/vercelSDK";
import { IConversationalAgent, ModelConversationMessage } from "./Interfaces";

export class ANewsSummarizer extends VercelSDK implements IConversationalAgent {
    constructor(model: LanguageModel = VERCEL_AI_MODELS.DEFAULT) {
        const _SYSTEM_PROMPT = `
        You are a news summarizer, the user will give you several news article, and your job is to essentially summarize each news article into a headline + 3-5 bullet points. 
        ## Guardrails
        - Each bullet point should only be 1 sentence with a single focus
        ### Output
            1. Headline
            - Bullet point 1
            - Bullet ppoint 2
    `;
        super(_SYSTEM_PROMPT, model);
    }
    async sendMessages(messages: ModelConversationMessage[]): Promise<string> {
        return await super.promptMessage(messages);
    }
}
