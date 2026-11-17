import { Client, GatewayIntentBits, Message, type TextBasedChannel } from 'discord.js';
import { asDomainError, DomainError, ErrorCode } from '@utils/ErrorCode';
import logger from '@utils/Logger';

export interface DiscordInboundMessage {
	id: string;
	content: string;
	authorId: string;
	authorUsername: string;
	channelId: string;
	channelName: string;
}

type DiscordMessageSubscriber = {
	channelId?: string;
	pending: DiscordInboundMessage[];
	wake: ((message: DiscordInboundMessage | null) => void) | null;
};

/**
 * Receives Discord channel messages over the bot gateway.
 * Separate from DiscordWebhookApi: webhooks only post, a bot token plus a
 * WebSocket gateway connection is required to receive MESSAGE_CREATE events.
 */
export class DiscordBotClient {
	private readonly token: string;
	private readonly client: Client;
	private readonly subscribers = new Set<DiscordMessageSubscriber>();
	private loginPromise: Promise<string> | null = null;
	private stopped = false;
	private readonly dispatchMessage = (message: Message): void => {
		if (message.author.bot) return;

		const inbound = toInbound(message);
		for (const subscriber of this.subscribers) {
			if (subscriber.channelId && message.channelId !== subscriber.channelId) continue;

			if (subscriber.wake) {
				const resolve = subscriber.wake;
				subscriber.wake = null;
				resolve(inbound);
			} else {
				subscriber.pending.push(inbound);
			}
		}
	};

	constructor(token = process.env.DISCORD_BOT_TOKEN) {
		if (!token) {
			throw new DomainError(ErrorCode.SERVER_ERROR, 'DISCORD_BOT_TOKEN is required');
		}

		this.token = token;
		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
			],
		});
		this.client.on('messageCreate', this.dispatchMessage);

		this.client.on('error', (error) => {
			logger.error('Discord client error', {
				error: error as Error,
			});
		});
	}

	/**
	 * Ends an active listen loop. Closes the gateway and unblocks the pending
	 * read so the generator finishes and runs its cleanup.
	 */
	stop(): void {
		this.stopped = true;
		this.client.destroy();
		for (const subscriber of this.subscribers) {
			if (subscriber.wake) {
				const resolve = subscriber.wake;
				subscriber.wake = null;
				resolve(null);
			}
		}
		if (this.subscribers.size === 0) this.loginPromise = null;
	}

	/**
	 * Yields inbound messages until the consumer stops iterating.
	 * Login happens on first `next()`, so a bad token surfaces as a thrown
	 * DomainError from the first read, not from construction.
	 * Pass a channelId to filter to one channel; omit to yield every message
	 * the bot can see.
	 */
	async *listen(channelId?: string): AsyncGenerator<DiscordInboundMessage> {
		if (this.stopped && this.subscribers.size === 0) this.stopped = false;
		if (this.stopped) return;

		const subscriber: DiscordMessageSubscriber = { channelId, pending: [], wake: null };
		this.subscribers.add(subscriber);

		try {
			await this.connect();
			while (!this.stopped) {
				const queued = subscriber.pending.shift();
				const next =
					queued ??
					(await new Promise<DiscordInboundMessage | null>((resolve) => {
						subscriber.wake = resolve;
					}));
				if (next === null) return;
				yield next;
			}
		} catch (error) {
			throw asDomainError(error, ErrorCode.NETWORK_ERROR, 'Discord bot gateway failed');
		} finally {
			this.subscribers.delete(subscriber);
			if (subscriber.wake) {
				const resolve = subscriber.wake;
				subscriber.wake = null;
				resolve(null);
			}
			if (this.subscribers.size === 0) {
				this.client.destroy();
				this.loginPromise = null;
			}
		}
	}

	private connect(): Promise<string> {
		if (!this.loginPromise) {
			this.loginPromise = this.client.login(this.token).catch((error: unknown) => {
				this.loginPromise = null;
				throw error;
			});
		}
		return this.loginPromise;
	}
}

const toInbound = (message: Message): DiscordInboundMessage => ({
	id: message.id,
	content: message.content,
	authorId: message.author.id,
	authorUsername: message.author.username,
	channelId: message.channelId,
	channelName: channelNameOf(message.channel),
});

const channelNameOf = (channel: TextBasedChannel): string =>
	channel.isDMBased() ? channel.id : channel.name;
