import { AGcalSummarizer } from "../agents/GcalSummarizer";
import { AgentSession } from "../harness/AgentSession";
import { Harness } from "../harness/Harness";
import { DiscordBotClient } from "../network/discord/DiscordBotClient";
import { DiscordWebhookApi } from "../network/discord/DiscordWebhookApi";
import { AbstractService } from "./AbstractService";
import { ILlmProvider } from "../network/llmProviders/Interfaces";

type IDiscordProductivityAssistantServiceDeps<TModelType> = {
    gcalSummarizerAgent: AGcalSummarizer;
    harness: Harness;
    llmProvider: ILlmProvider<TModelType>;
    model: TModelType;
    discordBotClient: DiscordBotClient;
    discordWebhookApi: DiscordWebhookApi;
};

export class DiscordProductivityAssistantService<
    TModelType,
> extends AbstractService {
    private readonly session: AgentSession<TModelType>;

    constructor(
        private readonly deps: IDiscordProductivityAssistantServiceDeps<TModelType>,
    ) {
        super();
        this.session = this.deps.harness.newSession({
            llmProvider: this.deps.llmProvider,
            agent: this.deps.gcalSummarizerAgent,
            model: this.deps.model,
        });
    }

    public async run(): Promise<void> {
        for await (const msg of this.deps.discordBotClient.listen(
            process.env.DISCORD_SERVER_ID,
        )) {
            if (msg.content == "stop") {
                break;
            }

            if (msg.content == "/compact") {
                await this.session.compactConversation();
                continue;
            }

            if (msg.authorId == process.env.DISCORD_ACCOUNT_ID) {
                await this.deps.discordWebhookApi.sendMessage(
                    "**Bot**: Message received, processing...",
                );
                const response = await this.session.sendMessage(msg.content);
                await this.deps.discordWebhookApi.sendMessage(response.reply);
            }
        }
        return;
    }
}
