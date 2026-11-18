import { AGcalSummarizer } from '@agent/agentConfig/GcalSummarizer';
import { AgentSession } from '@harness/core/AgentSession';
import { Harness } from '@harness/core/Harness';
import type { DiscordInboundMessage } from '@network/discord/DiscordBotClient';
import { DiscordBotClient } from '@network/discord/DiscordBotClient';
import type { OnlineEvaluationPublisher } from '@evaluation/online/Contracts';
import { createOnlineEvaluationMessage } from '@evaluation/online/createOnlineEvaluationMessage';
import { ILlmProvider } from '@providers/Interfaces';
import { getActiveSpan } from '@telemetry/Telemetry';
import { formatCompactionTokenStats } from './formatCompactionTokenStats';
import logger from '@utils/Logger';

type IDiscordProductivityAssistantServiceDeps<TModelType> = {
	gcalSummarizerAgent: AGcalSummarizer;
	harness: Harness;
	llmProvider: ILlmProvider<TModelType>;
	model: TModelType;
	discordBotClient: DiscordBotClient;
	onlineEvaluationPublisher: OnlineEvaluationPublisher;
};

export class DiscordProductivityAssistantService<TModelType> {
	private readonly session: AgentSession<TModelType>;

	constructor(private readonly deps: IDiscordProductivityAssistantServiceDeps<TModelType>) {
		this.session = this.deps.harness.newSession({
			llmProvider: this.deps.llmProvider,
			agent: this.deps.gcalSummarizerAgent,
			model: this.deps.model,
		});
	}

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
				await this.deps.discordBotClient.sendMessage(
					msg.channelId,
					'There is no productivity conversation to compact yet.',
				);
			} else {
				await this.deps.discordBotClient.sendMessage(
					msg.channelId,
					formatCompactionTokenStats(compacted),
				);
			}
			return false;
		}

		await this.deps.discordBotClient.sendMessage(
			msg.channelId,
			'**Bot**: Message received by productivity agent, processing...',
		);
		const response = await this.session.sendMessage(msg.content);
		try {
			if (!span) throw new Error('Cannot enqueue online evaluation without an active span');
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
		await this.deps.discordBotClient.sendMessage(msg.channelId, response.reply);

		span?.setAttribute('action', 'message');
		return false;
	}
}
