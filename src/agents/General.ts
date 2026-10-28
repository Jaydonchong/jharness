import { AbstractAgent } from "./AbstractAgent";

const SYSTEM_PROMPT =
    "You are a writer, your job is to write a summary of article provided";
export class AGeneral extends AbstractAgent {
    constructor() {
        super({
            systemPrompt: SYSTEM_PROMPT,
            agentTools: [],
        });
    }
}
