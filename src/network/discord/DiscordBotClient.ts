import {
    Client,
    GatewayIntentBits,
    Message,
    type TextBasedChannel,
} from "discord.js";
import { asDomainError, DomainError, ErrorCode } from "../../utils/ErrorCode";

export interface DiscordInboundMessage {
    id: string;
    content: string;
    authorId: string;
    authorUsername: string;
    channelId: string;
    channelName: string;
}

/**
 * Receives Discord channel messages over the bot gateway.
 * Separate from DiscordWebhookApi: webhooks only post, a bot token plus a
 * WebSocket gateway connection is required to receive MESSAGE_CREATE events.
 */
export class DiscordBotClient {
    private readonly token: string;
    private readonly client: Client;
    private wake: ((message: DiscordInboundMessage | null) => void) | null =
        null;
    private stopped = false;

    constructor(token = process.env.DISCORD_BOT_TOKEN) {
        if (!token) {
            throw new DomainError(
                ErrorCode.SERVER_ERROR,
                "DISCORD_BOT_TOKEN is required",
            );
        }

        this.token = token;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
    }

    /**
     * Ends an active listen loop. Closes the gateway and unblocks the pending
     * read so the generator finishes and runs its cleanup.
     */
    stop(): void {
        this.stopped = true;
        this.client.destroy();
        if (this.wake) {
            const resolve = this.wake;
            this.wake = null;
            resolve(null);
        }
    }

    /**
     * Yields inbound messages until the consumer stops iterating.
     * Login happens on first `next()`, so a bad token surfaces as a thrown
     * DomainError from the first read, not from construction.
     * Pass a channelId to filter to one channel; omit to yield every message
     * the bot can see.
     */
    async *listen(channelId?: string): AsyncGenerator<DiscordInboundMessage> {
        const pending: DiscordInboundMessage[] = [];
        this.stopped = false;
        this.wake = null;

        const onMessage = (message: Message) => {
            if (message.author.bot) return;
            if (channelId && message.channelId !== channelId) return;

            const inbound = toInbound(message);
            if (this.wake) {
                const resolve = this.wake;
                this.wake = null;
                resolve(inbound);
            } else {
                pending.push(inbound);
            }
        };

        this.client.on("messageCreate", onMessage);

        try {
            if (this.stopped) return;
            await this.client.login(this.token);
            while (true) {
                if (this.stopped) return;
                const queued = pending.shift();
                const next =
                    queued ??
                    (await new Promise<DiscordInboundMessage | null>(
                        (resolve) => {
                            this.wake = resolve;
                        },
                    ));
                if (next === null) return;
                yield next;
            }
        } catch (error) {
            throw asDomainError(
                error,
                ErrorCode.NETWORK_ERROR,
                "Discord bot gateway failed",
            );
        } finally {
            this.client.off("messageCreate", onMessage);
            this.client.destroy();
        }
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
