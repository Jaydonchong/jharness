import { AbstractAgent } from "./AbstractAgent";
import { RecallTool } from "../tools/RecallTool";
import { RememberTool } from "../tools/RememberTool";
import { WorkspaceTools } from "../tools/WorkspaceTools";

const SYSTEM_PROMPT =
    "You are a writer, your job is to write a summary of article provided";
export class AGeneral extends AbstractAgent {
    constructor(
        memoryTools: [RememberTool, RecallTool],
        workspaceTools: WorkspaceTools,
    ) {
        super({
            systemPrompt: SYSTEM_PROMPT,
            agentTools: [...memoryTools, ...workspaceTools],
        });
    }
}
