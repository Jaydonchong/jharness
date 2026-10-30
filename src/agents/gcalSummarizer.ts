import z from "zod";
import { GcalGetCalendarEventsTool } from "../tools/GcalTools";
import { RecallTool } from "../tools/RecallTool";
import { RememberTool } from "../tools/RememberTool";
import { WorkspaceTools } from "../tools/WorkspaceTools";
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

export const GcalEventSummarySchema = z.object({
    startDate: z.string().describe("Start date in DD-MM-YYYY format"),
    startTime: z.string().describe("Start time in HH:MM format"),
    endDate: z.string().describe("End date in DD-MM-YYYY format"),
    endTime: z.string().describe("End time in HH:MM format"),
    name: z.string().describe("Event name"),
    location: z.string().default("unspecified"),
    organizer: z.string().describe("Organizer's email, empty string if unknown"),
    participants: z.array(z.string().email()).default([]),
    status: z.enum(["Pending", "Accepted", "Cancelled"]),
});

export const GcalEventSummariesSchema = z.array(GcalEventSummarySchema);

export type GcalEventSummary = z.infer<typeof GcalEventSummarySchema>;

export class AGcalSummarizer extends AbstractAgent {
    constructor(
        gcalGetCalendarEventsTool: GcalGetCalendarEventsTool,
        memoryTools: [RememberTool, RecallTool],
        workspaceTools: WorkspaceTools,
    ) {
        super({
            systemPrompt: SYSTEM_PROMPT,
            agentTools: [
                gcalGetCalendarEventsTool,
                ...memoryTools,
                ...workspaceTools,
            ],
            outputSchema: GcalEventSummariesSchema,
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
