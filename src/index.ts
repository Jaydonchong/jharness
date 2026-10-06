import { ANewsSummarizer } from "./agents/newsSummarizer";
import { GoogleCalendarApi } from "./network/google/GoogleCalendarApi";
import { AgentSession } from "./harness/agentSession";
import { MOCK_NEWS } from "./utils/data";
import { GcalGetCalendarEventsTool } from "./tools/GcalTools";
import { AGcalSummarizer } from "./agents/gcalSummarizer";

const PROMPT = MOCK_NEWS;

void (async () => {
    const newsSummarizerAgent = new ANewsSummarizer();

    //GCAL
    const googleCalApi = new GoogleCalendarApi(
        process.env.GOOGLE_GCAL_CREDENTIALS_PATH!,
    );
    const gcalGetCalendarEventsTool = new GcalGetCalendarEventsTool({
        googleCalApi,
    });

    const gcalSummarizerAgent = new AGcalSummarizer(
        undefined,
        gcalGetCalendarEventsTool,
    );

    // console.table(await googleCalApi.listCalendars());

    // console.log(
    //     await googleCalApi.listEvents({
    //         calendarId: "example@gmail.com",
    //         end: new Date("2026-10-07T00:00:00+08:00"),
    //         start: new Date("2026-10-01T00:00:00+08:00"),
    //     }),
    // );
    // Text
    // const answer = await newsSummarizerAgent.promptText(PROMPT);
    // console.log(answer)

    // Conversation
    const session = new AgentSession(gcalSummarizerAgent);
    const response2 = await session.sendMessage(
        "What Calendar Event did I have for the October 2026",
    );
    console.log(response2);

    console.info("====COMPLETED====");
    process.exit(0);
})().catch((error) => {
    console.log(
        {
            error,
        },
        "ERROR while running app exiting",
    );
    process.exit(1);
});
