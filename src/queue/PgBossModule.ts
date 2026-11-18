import { PgBoss } from 'pg-boss';
import logger from '@utils/Logger';

export class PgBossModule {
	public readonly boss: PgBoss;

	public constructor(instanceName = 'jharness-app') {
		this.boss = new PgBoss({
			host: process.env.POSTGRES_HOST ?? '127.0.0.1',
			port: Number(process.env.POSTGRES_PORT ?? 5432),
			database: process.env.POSTGRES_DB ?? 'ai',
			user: process.env.POSTGRES_USER ?? 'postgres',
			password: process.env.POSTGRES_PASSWORD,
			instanceName,
			openTelemetry: { enabled: true, propagateContext: true },
		});
		this.boss.on('error', (error) => logger.error('PgBoss error', { error }));
	}

	public async start(): Promise<void> {
		await this.boss.start();
	}

	public async stop(): Promise<void> {
		await this.boss.stop();
	}
}
