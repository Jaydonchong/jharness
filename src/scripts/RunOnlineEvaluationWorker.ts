import { AppDataSource } from '@database/data-source';
import { EvaluationTrialEntity } from '@evaluation/data/EvaluationTrialEntity.entity';
import { EvaluationTrialRepository } from '@evaluation/data/EvaluationTrialRepository';
import { EvaluationMetrics } from '@evaluation/core/EvaluationMetrics';
import { createAgentOnlineEvaluationRegistry } from '@evaluation/online/AgentOnlineEvaluationRegistry';
import { OnlineEvaluationProcessor } from '@evaluation/online/OnlineEvaluationProcessor';
import { TempoEvaluationTraceReader } from '@evaluation/online/TempoEvaluationTraceReader';
import { PgBossOnlineEvaluationWorker } from '@queue/OnlineEvaluationQueue';
import { PgBossModule } from '@queue/PgBossModule';
import { VERCEL_AI_MODELS, VercelSDK } from '@providers/VercelSDK';
import { OTLPsdk } from '@telemetry/instrumentation';
import logger from '@utils/Logger';

let pgBossModule: PgBossModule | undefined;

async function main(): Promise<void> {
	await AppDataSource.initialize();
	pgBossModule = new PgBossModule('jharness-evaluation-worker');
	await pgBossModule.start();

	const provider = new VercelSDK();
	const processor = new OnlineEvaluationProcessor({
		registry: createAgentOnlineEvaluationRegistry(provider, VERCEL_AI_MODELS.DEFAULT),
		traceReader: new TempoEvaluationTraceReader(
			process.env.TEMPO_QUERY_URL ?? 'http://tempo:3200',
		),
		trialStore: new EvaluationTrialRepository(
			AppDataSource.getRepository(EvaluationTrialEntity),
		),
		metrics: new EvaluationMetrics(),
	});
	const worker = new PgBossOnlineEvaluationWorker(pgBossModule.boss, processor);
	await worker.start();
	logger.info('Online evaluation worker started');

	let isShuttingDown = false;
	const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
		if (isShuttingDown) return;
		isShuttingDown = true;
		logger.info('Stopping online evaluation worker', { signal });
		await shutdownResources();
	};

	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch(async (error) => {
	logger.error('Online evaluation worker failed to start', { error });
	await shutdownResources();
	process.exitCode = 1;
});

async function shutdownResources(): Promise<void> {
	try {
		if (pgBossModule) await pgBossModule.stop();
		if (AppDataSource.isInitialized) await AppDataSource.destroy();
		await OTLPsdk.shutdown();
	} catch (error) {
		logger.error('Failed to stop online evaluation worker cleanly', { error });
		process.exitCode = 1;
	}
}
