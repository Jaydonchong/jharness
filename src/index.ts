import { ANewsSummarizer } from "./agents/newsSummarizer";
import { AgentSession } from "./tool/agentSession";
import { MOCK_NEWS } from "./utils/data";

const PROMPT = MOCK_NEWS;

void (async () => {
    const newsSummarizerAgent = new ANewsSummarizer();
    // Text
    // const answer = await newsSummarizerAgent.promptText(PROMPT);
    // console.log(answer)

    // Conversation
    const session = new AgentSession(newsSummarizerAgent);
    const response1 = await session.sendMessage("End every sentence with PIKA");
    console.log(response1);
    console.log("Message", {
        msg: session.messages,
    });
    const response2 = await session.sendMessage(PROMPT);
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
