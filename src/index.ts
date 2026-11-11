import { GoogleCalendarApi } from './network/google/GoogleCalendarApi';
import { OpenSERP } from '@openserp/sdk';
import { OpenSerpSearchAdapter } from './network/webSearch/OpenSerpSearchAdapter';
import { MOCK_NEWS } from './utils/MockData';
import { GcalGetCalendarEventsTool } from './tools/gcal/GcalTools';
import { WebSearchTool } from './tools/webSearch/WebSearchTool';
import { Harness } from './harness/core/Harness';
import { DiscordWebhookApi } from './network/discord/DiscordWebhookApi';
import { AGeneral } from './agent/agentConfig/General';
import { ASystemDesign } from './agent/agentConfig/SystemDesign';
import { DiscordBotClient } from './network/discord/DiscordBotClient';
import { DiscordProductivityAssistantService } from './service/DiscordProductivityAssistantService';
import { SystemDesignDiscordService } from './service/SystemDesignDiscordService';
import { AGcalSummarizer } from './agent/agentConfig/GcalSummarizer';
import { CompactionPipeline } from './compaction/core/CompactionPipeline';
import { ModelSummarizer } from './compaction/handlers/ModelSummarizerHandler.ts';
import { RecentMessageRetainHandler } from './compaction/handlers/RecentMessageRetainHandler';
import { DedupeRepeatedContent } from './compaction/handlers/DedupeRepeatedContentHandler';
import { CompactionEngine } from './compaction/core/CompactionEngine';
import { ContextAssembler } from './memory/core/ContextAssembler';
import { LocalFileMemoryStore } from './memory/memoryStore/LocalFileMemoryStore/LocalFileMemoryStore';
import { PGChunkMemoryStore } from './memory/memoryStore/PGChunkMemoryStore/PGChunkMemoryStore';
import { RAGChunkRepository } from './memory/data/RAGChunkRepository';
import { RAGDocumentRepository } from './memory/data/RAGDocumentRepository';
import { RememberTool } from './tools/memory/RememberTool';
import { RecallTool } from './tools/memory/RecallTool';
import { ReadFileTool } from './tools/workspace/ReadFileTool';
import { ShellCommandTool } from './tools/workspace/ShellCommandTool';
import { WalkDirectoryTool } from './tools/workspace/WalkDirectoryTool';
import { WriteFileTool } from './tools/workspace/WriteFileTool';
import { WorkspaceToolSet } from './tools/workspace/WorkspaceToolSet';
import { VERCEL_AI_MODELS, VercelSDK } from './providers/VercelSDK';
import { CloudflareReranker } from './network/rerankingModel/CloudflareReranker';
import { AppDataSource } from './database/data-source';
import logger from './utils/Logger';
import { OTLPsdk } from './telemetry/instrumentation';

void (async () => {
	const dataSource = await AppDataSource.initialize();
	logger.info('dataSource initialized', {
		intialized: dataSource.isInitialized,
		database: 'postgres',
	});
	/**Tools */
	const googleCalApi = new GoogleCalendarApi(process.env.GOOGLE_GCAL_CREDENTIALS_PATH!);
	const gcalGetCalendarEventsTool = new GcalGetCalendarEventsTool({
		googleCalApi,
	});
	const openSerpClient = new OpenSERP({
		apiKey: process.env.OPENSERP_API_KEY,
		baseUrl: process.env.OPENSERP_BASE_URL,
	});
	const openSerpSearchAdapter = new OpenSerpSearchAdapter({ client: openSerpClient });
	// Deliberately leave this out of agent configs until web search is enabled for one.
	const webSearchTool = new WebSearchTool({ webSearchAdapter: openSerpSearchAdapter });
	const discordWebhookApi = new DiscordWebhookApi();
	const discordBotClient = new DiscordBotClient();
	/**Provider */
	const vercelSDK = new VercelSDK();
	/**
	 * Agent
	 */

	/**
	 * Compaction Engine
	 *
	 */
	const summaryCompactionNode = new ModelSummarizer({
		llmProvider: vercelSDK,
		model: VERCEL_AI_MODELS.DEFAULT,
	});
	// Refactor later when there are more pipelines using builder pattern
	const baseCompactionPipeline = new CompactionPipeline()
		.addNode(new RecentMessageRetainHandler({ threshold: 2 }))
		.addNode(new DedupeRepeatedContent())
		.addNode(summaryCompactionNode);
	const compactionEngine = new CompactionEngine(baseCompactionPipeline);
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
	const gcalSummarizerAgent = new AGcalSummarizer(
		gcalGetCalendarEventsTool,
		memoryTools,
		workspaceTools,
	);
	const generalPurposeAgent = new AGeneral(memoryTools, workspaceTools);

	/**
	 * Harness
	 */
	const harness = new Harness({
		compactionEngine,
		contextAssembler,
	});
	const session = harness.newSession({
		llmProvider: vercelSDK,
		agent: gcalSummarizerAgent,
		model: VERCEL_AI_MODELS.DEFAULT,
	});

	// const response = await session.sendMessage(
	//     "What are the events that I have for the first half of Oct 2026",
	// );
	// console.log(`Assistant: ${response}`);
	// await discordApi.sendMessage(response)

	const productivityService = new DiscordProductivityAssistantService({
		gcalSummarizerAgent,
		harness,
		llmProvider: vercelSDK,
		model: VERCEL_AI_MODELS.DEFAULT,
		discordBotClient,
		discordWebhookApi,
	});
	const systemDesignService = new SystemDesignDiscordService({
		systemDesignAgent: new ASystemDesign(memoryTools[1]),
		harness,
		llmProvider: vercelSDK,
		model: VERCEL_AI_MODELS.DEFAULT,
		discordBotClient,
		discordWebhookApi,
	});

	// let streamedResponse = "";
	// process.stdout.write("Assistant: ");
	// for await (const chunk of session2.streamMessage(
	//     "Write me a 300 word essay about Malaysia",
	// )) {
	//     process.stdout.write(chunk);
	//     streamedResponse += chunk;
	//     await new Promise((resolve)=>{setTimeout(resolve, 100)});
	// }
	// process.stdout.write("\n");

	await Promise.all([productivityService.run(), systemDesignService.run()]);

	await harness.close();
	console.info('====COMPLETED====');
	await OTLPsdk.shutdown();
	process.exit(0);
})().catch((error) => {
	console.log(
		{
			error,
		},
		'ERROR while running app exiting',
	);
	process.exit(1);
});
