import { AbstractAgentConfig } from './AbstractAgentConfig';
import { RecallTool } from '../../tools/memory/RecallTool';
import { RememberTool } from '../../tools/memory/RememberTool';
import { WorkspaceToolSet } from '../../tools/workspace/WorkspaceToolSet';

const SYSTEM_PROMPT = 'You are a writer, your job is to write a summary of article provided';
export class AGeneral extends AbstractAgentConfig {
	constructor(memoryTools: [RememberTool, RecallTool], workspaceTools: WorkspaceToolSet) {
		super({
			systemPrompt: SYSTEM_PROMPT,
			agentTools: [...memoryTools, ...workspaceTools],
		});
	}
}
