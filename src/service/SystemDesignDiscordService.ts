import { AgentSession } from '../harness/core/AgentSession';
import { Harness } from '../harness/core/Harness';
import { DiscordBotClient, type DiscordInboundMessage } from '../network/discord/DiscordBotClient';
import { DiscordWebhookApi } from '../network/discord/DiscordWebhookApi';
import { ILlmProvider } from '../providers/Interfaces';
import { ASystemDesign } from '../agent/agentConfig/SystemDesign';
import { AbstractService } from './AbstractService';

type SystemDesignDiscordServiceDeps<TModelType> = {
	systemDesignAgent: ASystemDesign;
	harness: Harness;
	llmProvider: ILlmProvider<TModelType>;
	model: TModelType;
	discordBotClient: DiscordBotClient;
	discordWebhookApi: DiscordWebhookApi;
};

export class SystemDesignDiscordService<TModelType> extends AbstractService {
	private readonly session: AgentSession<TModelType>;

	constructor(private readonly deps: SystemDesignDiscordServiceDeps<TModelType>) {
		super('discord-system-design');
		this.session = this.deps.harness.newSession({
			llmProvider: this.deps.llmProvider,
			agent: this.deps.systemDesignAgent,
			model: this.deps.model,
		});
	}

	public async run(): Promise<void> {
		for await (const message of this.deps.discordBotClient.listen(
			process.env.DISCORD_SYSTEM_DESIGN_CHANNEL_ID,
		)) {
			if (await this.handleMessage(message)) {
				break;
			}
		}
	}

	public async handleMessage(message: DiscordInboundMessage): Promise<boolean> {
		return this.tracer.startActiveSpan(`request.incoming`, async (span) => {
			if (message.content.trim() === 'stop') {
				span.setAttribute('action', 'stop');
				return true;
			}

			if (message.content.trim() === '/compact') {
				span.setAttribute('action', 'compact');
				const compacted = await this.session.compactConversation();
				await this.deps.discordWebhookApi.sendMessage(
					compacted
						? '-# conversation compacted.'
						: 'There is no system design conversation to compact yet.',
				);
				return false;
			}
			span.setAttribute('action', 'message');
			const response = await this.session.sendMessage(message.content);
			await this.deps.discordWebhookApi.sendMessage(response.reply);
			return false;
		});
	}
}
