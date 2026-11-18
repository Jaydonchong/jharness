import type { PgBoss } from 'pg-boss';
import type {
	OnlineEvaluationMessage,
	OnlineEvaluationPublisher,
} from '@evaluation/online/Contracts';
import { OnlineEvaluationProcessor } from '@evaluation/online/OnlineEvaluationProcessor';

export const ONLINE_EVALUATION_QUEUE = 'online-evaluation';

export class PgBossOnlineEvaluationPublisher implements OnlineEvaluationPublisher {
	public constructor(private readonly boss: PgBoss) {}

	public async start(): Promise<void> {
		await this.boss.createQueue(ONLINE_EVALUATION_QUEUE, { policy: 'exclusive' });
	}

	public async enqueue(message: OnlineEvaluationMessage): Promise<void> {
		await this.boss.send(ONLINE_EVALUATION_QUEUE, message, {
			singletonKey: message.sessionId,
		});
	}
}

export class PgBossOnlineEvaluationWorker {
	public constructor(
		private readonly boss: PgBoss,
		private readonly processor: OnlineEvaluationProcessor,
	) {}

	public async start(): Promise<void> {
		await this.boss.createQueue(ONLINE_EVALUATION_QUEUE, { policy: 'exclusive' });
		await this.boss.work<OnlineEvaluationMessage>(
			ONLINE_EVALUATION_QUEUE,
			{ batchSize: 1 },
			async ([job]) => {
				if (job) await this.processor.evaluate(job.data);
			},
		);
	}
}
