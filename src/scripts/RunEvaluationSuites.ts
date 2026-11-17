import { OpenSERP } from '@openserp/sdk';
import { GoogleCalendarApi } from '@network/google/GoogleCalendarApi';
import { OpenSerpSearchAdapter } from '@network/webSearch/OpenSerpSearchAdapter';
import { GcalGetCalendarEventsTool } from '@tools/gcal/GcalTools';
import { WebSearchTool } from '@tools/webSearch/WebSearchTool';
import { Harness } from '@harness/core/Harness';
import { ASystemDesign } from '@agent/agentConfig/SystemDesign';
import { AGcalSummarizer } from '@agent/agentConfig/GcalSummarizer';
import { CompactionPipeline } from '@compaction/core/CompactionPipeline';
import { ModelSummarizer } from '@compaction/handlers/ModelSummarizerHandler.ts';
import { RecentMessageRetainHandler } from '@compaction/handlers/RecentMessageRetainHandler';
import { DedupeRepeatedContent } from '@compaction/handlers/DedupeRepeatedContentHandler';
import { CompactionEngine } from '@compaction/core/CompactionEngine';
import { ContextAssembler } from '@memory/core/ContextAssembler';
import { LocalFileMemoryStore } from '@memory/memoryStore/LocalFileMemoryStore/LocalFileMemoryStore';
import { PGChunkMemoryStore } from '@memory/memoryStore/PGChunkMemoryStore/PGChunkMemoryStore';
import { RAGChunkRepository } from '@memory/data/RAGChunkRepository';
import { RAGDocumentRepository } from '@memory/data/RAGDocumentRepository';
import { RememberTool } from '@tools/memory/RememberTool';
import { RecallTool } from '@tools/memory/RecallTool';
import { ReadFileTool } from '@tools/workspace/ReadFileTool';
import { ShellCommandTool } from '@tools/workspace/ShellCommandTool';
import { WalkDirectoryTool } from '@tools/workspace/WalkDirectoryTool';
import { WriteFileTool } from '@tools/workspace/WriteFileTool';
import { WorkspaceToolSet } from '@tools/workspace/WorkspaceToolSet';
import { VERCEL_AI_MODELS, VercelSDK } from '@providers/VercelSDK';
import { CloudflareReranker } from '@network/rerankingModel/CloudflareReranker';
import { AppDataSource } from '@database/data-source';
import { EvaluationHarness, AgentSessionEvaluationTarget } from '@evaluation/EvaluationModule';
import type { EvaluationSuiteRun } from '@evaluation/EvaluationModule';
import { AgentSuiteRegistry } from '@evaluation/AgentSuiteRegistry';
import { EvaluationTrialEntity } from '@evaluation/data/EvaluationTrialEntity.entity';
import { EvaluationTrialRepository } from '@evaluation/data/EvaluationTrialRepository';

const run = async (): Promise<void> => {
	let appHarness: Harness | undefined;
	let failedSuites = 0;

	try {
		await AppDataSource.initialize();

		const vercelSDK = new VercelSDK();
		const compactionPipeline = new CompactionPipeline()
			.addNode(
				new RecentMessageRetainHandler({
					threshold: 2,
				}),
			)
			.addNode(new DedupeRepeatedContent())
			.addNode(
				new ModelSummarizer({
					llmProvider: vercelSDK,
					model: VERCEL_AI_MODELS.DEFAULT,
				}),
			);
		const compactionEngine = new CompactionEngine(compactionPipeline);
		const contextAssembler = new ContextAssembler({
			memoryStore: new LocalFileMemoryStore(),
			pgChunkMemoryStore: new PGChunkMemoryStore(
				new RAGDocumentRepository(),
				new RAGChunkRepository(),
				new CloudflareReranker({}),
			),
			compactionEngine,
		});
		const memoryTools: [RememberTool, RecallTool] = [
			new RememberTool({ contextAssembler }),
			new RecallTool({ contextAssembler }),
		];
		const workspaceTools: WorkspaceToolSet = [
			new ReadFileTool(),
			new WriteFileTool(),
			new ShellCommandTool(process.cwd()),
			new WalkDirectoryTool(),
		];
		const googleCalApi = new GoogleCalendarApi(process.env.GOOGLE_GCAL_CREDENTIALS_PATH!);
		const calendarTool = new GcalGetCalendarEventsTool({ googleCalApi });
		const openSerpClient = new OpenSERP({
			apiKey: process.env.OPENSERP_API_KEY,
			baseUrl: process.env.OPENSERP_BASE_URL,
		});
		const webSearchTool = new WebSearchTool({
			webSearchAdapter: new OpenSerpSearchAdapter({ client: openSerpClient }),
		});
		const agents = {
			'gcal-summarizer': new AGcalSummarizer(calendarTool, memoryTools, workspaceTools),
			'system-design': new ASystemDesign(memoryTools[1], webSearchTool),
		};
		appHarness = new Harness({ compactionEngine, contextAssembler });
		const trialStore = new EvaluationTrialRepository(
			AppDataSource.getRepository(EvaluationTrialEntity),
		);
		for (const [agentName, suites] of Object.entries(AgentSuiteRegistry)) {
			const agent = agents[agentName as keyof typeof agents];
			if (!agent)
				throw new Error(`No agent config registered for evaluation key: ${agentName}`);

			for (const suite of suites) {
				const evaluationHarness = new EvaluationHarness({
					target: new AgentSessionEvaluationTarget(() =>
						appHarness!.newSession({
							llmProvider: vercelSDK,
							agent,
							model: VERCEL_AI_MODELS.DEFAULT,
						}),
					),
					trialStore,
				});

				try {
					const suiteRun = await evaluationHarness.runSuite(suite);
					console.info(formatSuiteRun(agentName, suiteRun));
					if (!suiteRun.passed) failedSuites++;
				} catch (error) {
					failedSuites++;
					console.error(`FAIL ${agentName}/${suite.id}`);
					console.error(formatError(error));
				}
			}
		}
	} finally {
		try {
			await appHarness?.close();
		} finally {
			if (AppDataSource.isInitialized) await AppDataSource.destroy();
		}
	}

	if (failedSuites > 0) process.exitCode = 1;
};

function formatSuiteRun(agentName: string, suiteRun: EvaluationSuiteRun): string {
	const passedTrials = suiteRun.trials.filter((trial) => trial.passed).length;
	const failedTrials = suiteRun.trials.length - passedTrials;
	const graderOutcomes = suiteRun.trials.flatMap((trial) => Object.values(trial.graderOutcomes));
	const passedGraders = graderOutcomes.filter((outcome) => outcome.passed).length;
	const failedGraders = graderOutcomes.length - passedGraders;
	const lines = [`${suiteRun.passed ? 'PASS' : 'FAIL'} ${agentName}/${suiteRun.suiteId}`];

	for (const trial of suiteRun.trials) {
		lines.push(`  ${trial.passed ? '✓' : '✗'} ${trial.taskId}`);
		for (const [graderId, outcome] of Object.entries(trial.graderOutcomes)) {
			const explanation = outcome.details?.explanation;
			lines.push(
				`    ${outcome.passed ? '✓' : '✗'} ${graderId} (${outcome.score.toFixed(2)})${
					typeof explanation === 'string' ? ` — ${explanation}` : ''
				}`,
			);
		}
		if (trial.error) lines.push(`    Error: ${trial.error}`);
	}

	lines.push(
		`  Trials: ${passedTrials} passed, ${failedTrials} failed, ${suiteRun.trials.length} total`,
		`  Graders: ${passedGraders} passed, ${failedGraders} failed, ${graderOutcomes.length} total`,
	);
	return lines.join('\n');
}

function formatError(error: unknown): string {
	return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

void run().catch((error: unknown) => {
	console.error('Evaluation suite run failed', error);
	process.exitCode = 1;
});
