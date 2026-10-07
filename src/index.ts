import { GoogleCalendarApi } from "./network/google/GoogleCalendarApi";
import { AgentSession } from "./harness/AgentSession";
import { MOCK_NEWS } from "./utils/MockData";
import { GcalGetCalendarEventsTool } from "./tools/GcalTools";
import { AGcalSummarizer } from "./agents/GcalSummarizer";
import { VERCEL_AI_MODELS, VercelSDK } from "./network/llmProviders/VercelSDK";
import { Harness } from "./harness/Harness";
import { DiscordWebhookApi } from "./network/discord/DiscordWebhookApi";

const PROMPT = MOCK_NEWS;

void (async () => {
    /**Tools */
    const googleCalApi = new GoogleCalendarApi(
        process.env.GOOGLE_GCAL_CREDENTIALS_PATH!,
    );
    const gcalGetCalendarEventsTool = new GcalGetCalendarEventsTool({
        googleCalApi,
    });
    const discordApi = new DiscordWebhookApi();
    /**Provider */
    const vercelSDK = new VercelSDK();
    /**
     * Agent
     */
    const gcalSummarizerAgent = new AGcalSummarizer(gcalGetCalendarEventsTool);
    /**
     * Harness
     */
    const harness = new Harness();
    const session = harness.newSession({
        llmProvider: vercelSDK,
        agent: gcalSummarizerAgent,
        model: VERCEL_AI_MODELS.DEFAULT,
    });

    const response = await session.sendMessage(
        "What are the events that I have for the first half of Oct 2026",
    );
    console.log(`Assistant: ${response}`);
    // await discordApi.sendMessage(response)


    let streamedResponse = ''
    process.stdout.write('Assistant: ')
    for await (const chunk of session.streamMessage(
        "What about the second half of Oct 2026"
    )){
        process.stdout.write(chunk);
        streamedResponse +=chunk
    }
    process.stdout.write("\n")

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
