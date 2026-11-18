import type { DiscordInboundMessage } from '@network/discord/DiscordBotClient';
import { DiscordBotClient } from '@network/discord/DiscordBotClient';
import { getActiveSpan } from '@telemetry/Telemetry';
import { TraceScope, WithSpan } from '@telemetry/Decorators';
import logger from '@utils/Logger';
import { DomainError, ErrorCode } from '@utils/ErrorCode';

/** Return true to stop routing further messages for that channel. */
export type DiscordMessageHandler = (message: DiscordInboundMessage) => Promise<boolean>;
export type DiscordMessageRoute = { agentName: string; handler: DiscordMessageHandler };

export type DiscordControllerOptions = {
	allowedUserIds: ReadonlySet<string>;
	routesByChannelName: ReadonlyMap<string, DiscordMessageRoute>;
	discordBotClient: DiscordBotClient;
};

@TraceScope('controller.discord')
export class DiscordController {
	private readonly routesByChannelName: Map<string, DiscordMessageRoute>;
	private readonly stoppedRoutes = new Set<string>();

	public constructor(private readonly options: DiscordControllerOptions) {
		const normalizedRoutes = [...options.routesByChannelName].map(
			([channelName, handler]) => [channelName.trim().toLowerCase(), handler] as const,
		);
		this.routesByChannelName = new Map(normalizedRoutes);

		if (this.routesByChannelName.size === 0) {
			throw new DomainError(
				ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
				'At least one Discord channel route must be configured',
			);
		}
		if (this.routesByChannelName.size !== normalizedRoutes.length) {
			throw new DomainError(
				ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
				'Discord channel route names must be unique',
			);
		}
		if (options.allowedUserIds.size === 0) {
			throw new DomainError(
				ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR,
				'At least one allowed Discord user ID must be configured',
			);
		}
	}

	@WithSpan('request.incoming')
	public async handleMessage(message: DiscordInboundMessage): Promise<void> {
		const span = getActiveSpan();
		if (!this.options.allowedUserIds.has(message.authorId)) {
			span?.setAttribute('action', 'unauthorized');
			return;
		}

		const channelName = message.channelName.trim().toLowerCase();
		const handler = this.routesByChannelName.get(channelName);
		if (!handler || this.stoppedRoutes.has(channelName)) {
			span?.setAttribute('action', 'unrouted');
			return;
		}

		try {
			if (await handler.handler(message)) {
				this.stoppedRoutes.add(channelName);
				logger.info('Discord route stopped', { channelName });
			}
		} catch (error) {
			logger.error('Discord agent failed while processing message', {
				agentName: handler.agentName,
				channelName,
				error,
			});
			try {
				await this.options.discordBotClient.sendMessage(
					message.channelId,
					`${handler.agentName} failed while processing your request`,
				);
			} catch (replyError) {
				logger.error('Failed to send Discord agent failure reply', {
					agentName: handler.agentName,
					channelName,
					error: replyError,
				});
			}
		}
	}
}
