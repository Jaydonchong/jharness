import { AbstractAgent } from "./AbstractAgent";
import { RecallTool } from "../tools/RecallTool";
import { RememberTool } from "../tools/RememberTool";

const SYSTEM_PROMPT =
    "You are a writer, your job is to write a summary of article provided";
export class AGeneral extends AbstractAgent {
    constructor(memoryTools: [RememberTool, RecallTool]) {
        super({
            systemPrompt: SYSTEM_PROMPT,
            agentTools: memoryTools,
        });
    }
}
