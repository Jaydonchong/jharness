import { AGcalSummarizer } from '../agent/agentConfig/GcalSummarizer';
import { AgentSession } from '../harness/AgentSession';
import { Harness } from '../harness/Harness';
import { DiscordBotClient, type DiscordInboundMessage } from '../network/discord/DiscordBotClient';
import { DiscordWebhookApi } from '../network/discord/DiscordWebhookApi';
import { ILlmProvider } from '../providers/Interfaces';
import { AbstractService } from './AbstractService';

type IDiscordProductivityAssistantServiceDeps<TModelType> = {
	gcalSummarizerAgent: AGcalSummarizer;
	harness: Harness;
	llmProvider: ILlmProvider<TModelType>;
	model: TModelType;
	discordBotClient: DiscordBotClient;
	discordWebhookApi: DiscordWebhookApi;
};

export class DiscordProductivityAssistantService<TModelType> extends AbstractService {
	private readonly session: AgentSession<TModelType>;

	constructor(private readonly deps: IDiscordProductivityAssistantServiceDeps<TModelType>) {
		super('discord-productivity-assistant');
		this.session = this.deps.harness.newSession({
			llmProvider: this.deps.llmProvider,
			agent: this.deps.gcalSummarizerAgent,
			model: this.deps.model,
		});
	}

	public async run(): Promise<void> {
		for await (const msg of this.deps.discordBotClient.listen(process.env.DISCORD_SERVER_ID)) {
			if (await this.handleMessage(msg)) {
				break;
			}
		}
	}

	public async handleMessage(msg: DiscordInboundMessage): Promise<boolean> {
		return this.tracer.startActiveSpan('request.incoming', async (span) => {
			if (msg.content === 'stop') {
				span.setAttribute('action', 'stop');
				return true;
			}

			if (msg.content === '/compact') {
				span.setAttribute('action', 'compact');
				await this.session.compactConversation();
				return false;
			}

			// if (msg.authorId === process.env.DISCORD_ACCOUNT_ID) {
			// 	await this.deps.discordWebhookApi.sendMessage(
			// 		'**Bot**: Message received, processing...',
			// 	);
			// 	const response = await this.session.sendMessage(msg.content);
			// 	await this.deps.discordWebhookApi.sendMessage(response.reply);
			// }

			span.setAttribute('action', 'message');
			return false;
		});
	}
}
