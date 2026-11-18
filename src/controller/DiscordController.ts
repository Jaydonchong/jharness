import type { DiscordInboundMessage } from '@network/discord/DiscordBotClient';
import { getActiveSpan } from '@telemetry/Telemetry';
import { TraceScope, WithSpan } from '@telemetry/Decorators';
import logger from '@utils/Logger';

/** Return true to stop routing further messages for that channel. */
export type DiscordMessageHandler = (message: DiscordInboundMessage) => Promise<boolean>;

export type DiscordControllerOptions = {
	allowedUserIds: ReadonlySet<string>;
	routesByChannelName: ReadonlyMap<string, DiscordMessageHandler>;
};

@TraceScope('controller.discord')
export class DiscordController {
	private readonly routesByChannelName: Map<string, DiscordMessageHandler>;
	private readonly stoppedRoutes = new Set<string>();

	public constructor(private readonly options: DiscordControllerOptions) {
		const normalizedRoutes = [...options.routesByChannelName].map(
			([channelName, handler]) => [channelName.trim().toLowerCase(), handler] as const,
		);
		this.routesByChannelName = new Map(normalizedRoutes);

		if (this.routesByChannelName.size === 0) {
			throw new Error('At least one Discord channel route must be configured');
		}
		if (this.routesByChannelName.size !== normalizedRoutes.length) {
			throw new Error('Discord channel route names must be unique');
		}
		if (options.allowedUserIds.size === 0) {
			throw new Error('At least one allowed Discord user ID must be configured');
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

		if (await handler(message)) {
			this.stoppedRoutes.add(channelName);
			logger.info('Discord route stopped', { channelName });
		}
	}
}
