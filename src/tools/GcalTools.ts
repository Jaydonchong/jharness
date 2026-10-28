import z from "zod";
import {
    GoogleCalendarApi,
    ICalendarEvent,
} from "../network/google/GoogleCalendarApi";
import { AgentTool } from "./AgentTool";

export const GcalGetCalendarEventInputSchema = z.object({
    start: z
        .string()
        .describe("search start date range for events in ISO Format"),
    end: z.string().describe("search end date range for events in ISO Format"),
});

export const GcalGetCalendarEventOutputSchema = z.array(
    z.object({
        id: z.string(),
        summary: z.string().optional(),
        start: z
            .object({
                date: z.string().optional(),
                dateTime: z.string().optional(),
                timeZone: z.string().optional(),
            })
            .optional(),
        end: z
            .object({
                date: z.string().optional(),
                dateTime: z.string().optional(),
                timeZone: z.string().optional(),
            })
            .optional(),
    }),
);

export class GcalGetCalendarEventsTool extends AgentTool<
    typeof GcalGetCalendarEventInputSchema,
    typeof GcalGetCalendarEventOutputSchema
> {
    constructor(private readonly deps: { googleCalApi: GoogleCalendarApi }) {
        super({
            name: "gcal_list_events",
            description: `Get events within a time range, use this when user asks for events or contents of their calendar`,
            inputSchema: GcalGetCalendarEventInputSchema,
            outputSchema: GcalGetCalendarEventOutputSchema,
        });
    }

    protected async execute(input: {
        start: string;
        end: string;
    }): Promise<ICalendarEvent[]> {
        //TODO : validate input
        const events = await this.deps.googleCalApi.listEvents({
            calendarId: process.env.GOOGLE_GCAL_DEFAULT_CALENDAR_ID!,
            start: new Date(input.start),
            end: new Date(input.end),
        });

        return events;
    }
}
