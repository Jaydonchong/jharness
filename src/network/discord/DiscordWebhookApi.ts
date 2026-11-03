import axios from 'axios';
import { asDomainError, DomainError, ErrorCode } from '../../utils/ErrorCode';

const TIMEOUT = 15_000;

export class DiscordWebhookApi {
	private readonly webhookUrl: string;

	constructor(webhookUrl = process.env.DISCORD_CHANNEL_WEBHOOK_URL) {
		if (!webhookUrl) {
			throw new DomainError(
				ErrorCode.SERVER_ERROR,
				'DISCORD_CHANNEL_WEBHOOK_URL is required',
			);
		}

		this.webhookUrl = webhookUrl;
	}

	async sendMessage(content: string): Promise<void> {
		try {
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
		} catch (error) {
			throw asDomainError(error, ErrorCode.NETWORK_ERROR, 'Discord webhook request failed');
		}
	}
}
