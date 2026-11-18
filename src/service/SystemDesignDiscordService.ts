import { AgentSession } from '@harness/core/AgentSession';
import { Harness } from '@harness/core/Harness';
import type { DiscordInboundMessage } from '@network/discord/DiscordBotClient';
import { DiscordBotClient } from '@network/discord/DiscordBotClient';
import type { OnlineEvaluationPublisher } from '@evaluation/online/Contracts';
import { createOnlineEvaluationMessage } from '@evaluation/online/createOnlineEvaluationMessage';
import { ILlmProvider } from '@providers/Interfaces';
import { ASystemDesign } from '@agent/agentConfig/SystemDesign';
import { getActiveSpan } from '@telemetry/Telemetry';
import { formatCompactionTokenStats } from './formatCompactionTokenStats';
import logger from '@utils/Logger';

type SystemDesignDiscordServiceDeps<TModelType> = {
	systemDesignAgent: ASystemDesign;
	harness: Harness;
	llmProvider: ILlmProvider<TModelType>;
	model: TModelType;
	discordBotClient: DiscordBotClient;
	onlineEvaluationPublisher: OnlineEvaluationPublisher;
};

export class SystemDesignDiscordService<TModelType> {
	private readonly session: AgentSession<TModelType>;

	constructor(private readonly deps: SystemDesignDiscordServiceDeps<TModelType>) {
		this.session = this.deps.harness.newSession({
			llmProvider: this.deps.llmProvider,
			agent: this.deps.systemDesignAgent,
			model: this.deps.model,
		});
	}

	public async handleMessage(message: DiscordInboundMessage): Promise<boolean> {
		const span = getActiveSpan();
		if (message.content.trim() === 'stop') {
			span?.setAttribute('action', 'stop');
			return true;
		}

		if (message.content.trim() === '/compact') {
			span?.setAttribute('action', 'compact');
			const compacted = await this.session.compactConversation();
			await this.deps.discordBotClient.sendMessage(
				message.channelId,
				compacted
					? formatCompactionTokenStats(compacted)
					: 'There is no system design conversation to compact yet.',
			);
			return false;
		}
		span?.setAttribute('action', 'message');
		const response = await this.session.sendMessage(message.content);
		try {
			await this.deps.discordBotClient.sendMessage(
				message.channelId,
				'**Bot**: Message received by System Design Assistant, processing...',
			);
			if (!span) throw new Error('Cannot enqueue online evaluation without an active span');
			const completedAt = new Date().toISOString();
			await this.deps.onlineEvaluationPublisher.enqueue(
				createOnlineEvaluationMessage(span, {
					sessionId: this.session.id,
					agentName: this.deps.systemDesignAgent.name,
					input: message.content,
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
				agentName: this.deps.systemDesignAgent.name,
				error,
			});
		}
		await this.deps.discordBotClient.sendMessage(message.channelId, response.reply);
		return false;
	}
}
