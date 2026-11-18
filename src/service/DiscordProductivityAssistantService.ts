import { AGcalSummarizer } from '@agent/agentConfig/GcalSummarizer';
import { AgentSession } from '@harness/core/AgentSession';
import { Harness } from '@harness/core/Harness';
import { DiscordBotClient, type DiscordInboundMessage } from '@network/discord/DiscordBotClient';
import { DiscordWebhookApi } from '@network/discord/DiscordWebhookApi';
import type { OnlineEvaluationPublisher } from '@evaluation/online/Contracts';
import { createOnlineEvaluationMessage } from '@evaluation/online/createOnlineEvaluationMessage';
import { ILlmProvider } from '@providers/Interfaces';
import { getActiveSpan } from '@telemetry/Telemetry';
import { TraceScope, WithSpan } from '@telemetry/Decorators';
import { AbstractService } from './AbstractService';
import { formatCompactionTokenStats } from './formatCompactionTokenStats';
import logger from '@utils/Logger';

type IDiscordProductivityAssistantServiceDeps<TModelType> = {
	gcalSummarizerAgent: AGcalSummarizer;
	harness: Harness;
	llmProvider: ILlmProvider<TModelType>;
	model: TModelType;
	discordBotClient: DiscordBotClient;
	discordWebhookApi: DiscordWebhookApi;
	onlineEvaluationPublisher: OnlineEvaluationPublisher;
};

@TraceScope('service.discord-productivity-assistant')
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
		// for await (const msg of this.deps.discordBotClient.listen(process.env.DISCORD_SERVER_ID)) {
		// 	if (await this.handleMessage(msg)) {
		// 		break;
		// 	}
		// }
	}

	@WithSpan('request.incoming')
	public async handleMessage(msg: DiscordInboundMessage): Promise<boolean> {
		const span = getActiveSpan();
		if (msg.content === 'stop') {
			span?.setAttribute('action', 'stop');
			return true;
		}

		if (msg.content === '/compact') {
			span?.setAttribute('action', 'compact');
			const compacted = await this.session.compactConversation();
			if (!compacted) {
				await this.deps.discordWebhookApi.sendMessage(
					'There is no productivity conversation to compact yet.',
				);
			} else {
				await this.deps.discordWebhookApi.sendMessage(
					formatCompactionTokenStats(compacted),
				);
			}
			return false;
		}

		if (msg.authorId === process.env.DISCORD_ACCOUNT_ID) {
			await this.deps.discordWebhookApi.sendMessage(
				'**Bot**: Message received, processing...',
			);
			const response = await this.session.sendMessage(msg.content);
			try {
				if (!span)
					throw new Error('Cannot enqueue online evaluation without an active span');
				const completedAt = new Date().toISOString();
				await this.deps.onlineEvaluationPublisher.enqueue(
					createOnlineEvaluationMessage(span, {
						sessionId: this.session.id,
						agentName: this.deps.gcalSummarizerAgent.name,
						input: msg.content,
						output: {
							text: response.reply,
							structuredOutput: response.output,
						},
						completedAt,
					}),
				);
			} catch (error) {
				logger.error('Failed to enqueue online evaluation', {
					sessionId: this.session.id,
					agentName: this.deps.gcalSummarizerAgent.name,
					error,
				});
			}
			await this.deps.discordWebhookApi.sendMessage(response.reply);
		}

		span?.setAttribute('action', 'message');
		return false;
	}
}
