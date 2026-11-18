import { GcalGetCalendarEventsTool } from '@tools/gcal/GcalTools';
import { RecallTool } from '@tools/memory/RecallTool';
import { RememberTool } from '@tools/memory/RememberTool';
import { WorkspaceToolSet } from '@tools/workspace/WorkspaceToolSet';
import { WydTaskToolSet } from '@tools/wyd/WydTaskTools';
import { AbstractAgentConfig } from './AbstractAgentConfig';

const timeZone = 'Asia/Kuala_Lumpur';
const today = () =>
	new Intl.DateTimeFormat('en-US', {
		dateStyle: 'long',
		timeZone,
	}).format(new Date());

const SYSTEM_PROMPT = `
    You are a productivity assistant. Answer the user's questions about their Google Calendar schedule and Wyd task board using the available tools.
    When a month or year is not given for a schedule question, use the current date and ask a clarifying question if the intended time range is unclear.
    Only use Wyd tasks returned from the allowed folders. 
	Return your response as a numbered list, and do not include non-technical information such as UUID unless asked to explicitly
    `;

export class ProductivityAgent extends AbstractAgentConfig {
	public readonly name = 'productivity-agent';
	public readonly version = '1.0.0';

	constructor(
		gcalGetCalendarEventsTool: GcalGetCalendarEventsTool,
		memoryTools: [RememberTool, RecallTool],
		workspaceTools: WorkspaceToolSet,
		wydTaskTools?: WydTaskToolSet,
	) {
		super({
			systemPrompt: SYSTEM_PROMPT,
			agentTools: [
				gcalGetCalendarEventsTool,
				// ...memoryTools,
				...workspaceTools,
				...(wydTaskTools ?? []),
			],
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
