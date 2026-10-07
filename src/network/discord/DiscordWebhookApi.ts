import axios from "axios";

const TIMEOUT = 15_000;

export class DiscordWebhookApi {
    private readonly webhookUrl: string;

    constructor(webhookUrl = process.env.DISCORD_CHANNEL_WEBHOOK_URL) {
        if (!webhookUrl) {
            throw new Error("DISCORD_CHANNEL_WEBHOOK_URL is required");
        }

        this.webhookUrl = webhookUrl;
    }

    async sendMessage(content: string): Promise<void> {
        await axios.post(
            this.webhookUrl,
            {
                content,
                allowed_mentions: { parse: [] },
            },
            {
                params: { wait: true },
                timeout: TIMEOUT,
            },
        );
    }
}
