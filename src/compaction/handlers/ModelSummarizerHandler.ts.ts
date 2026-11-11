import { Counter, Histogram } from '@opentelemetry/api';
import { getActiveSpan, getMeter } from '../../telemetry/Telemetry';
import { BaselineTokenizer } from '../../utils/BaselineTokenizer';
import { DomainError, ErrorCode } from '../../utils/ErrorCode';
import { ILlmProvider } from '../../providers/Interfaces';
import { AbstractCompactionPipelineNode } from '../core/AbstractCompactionPipelineNode';
import { buildConversationCompactionPrompt } from '../core/prompts/conversation_compaction.prompt';
import { CompactionOutput } from '../core/Interfaces';

const MAX_NUDGE_RETRIES = 2;

type ModelSummarizerConfig<TModelType> = {
	llmProvider: ILlmProvider<TModelType>;
	model: TModelType;
};

export class ModelSummarizer<TModelType> extends AbstractCompactionPipelineNode {
	public readonly name = 'model-summarizer';
	private readonly tokenizer = new BaselineTokenizer();
	private readonly meter = getMeter('compaction-summarizer');
	private readonly nudgeCount: Histogram = this.meter.createHistogram(
		'compaction.summary.nudges',
		{
			description: 'Number of length nudges required for a compaction summary',
			unit: '{nudge}',
		},
	);
	private readonly summaryOutcomes: Counter = this.meter.createCounter(
		'compaction.summary.outcomes',
		{
			description:
				'Compaction summary outcomes, labeled by whether the target factor was met',
			unit: '{compaction}',
		},
	);

	constructor(private readonly config: ModelSummarizerConfig<TModelType>) {
		super();
	}

	public async execute(compactioninput: CompactionOutput): Promise<CompactionOutput> {
		if (compactioninput.compactedResult.length === 0) return compactioninput;
		const factor = compactioninput.input.config.factor;
		if (!Number.isFinite(factor) || factor <= 0 || factor > 1) {
			throw new DomainError(
				ErrorCode.COMPACTION_SETUP_ERROR,
				`Compaction factor must be greater than 0 and at most 1. Received: ${factor}`,
			);
		}

		const originalTokenCount = compactioninput.input.originalTokenCount;
		if (originalTokenCount === undefined) {
			throw new DomainError(
				ErrorCode.COMPACTION_SETUP_ERROR,
				'Compaction pipeline requires the original token count.',
			);
		}
		const sourceMessages = compactioninput.compactedResult;
		const targetTokens = Math.ceil(originalTokenCount * factor);
		const systemPrompt = `${buildConversationCompactionPrompt(
			compactioninput.input.systemPrompt,
			sourceMessages,
		)}\n\nKeep the summary at or below ${targetTokens} baseline tokens (${Math.round(factor * 100)}% of the original conversation context). Preserve the important requirements, decisions, and facts.`;

		let summary = '';
		let summaryTokens = 0;
		let nudges = 0;
		let factorMet = false;
		let outcome: 'success' | 'factor_not_met' | 'error' = 'error';
		try {
			while (true) {
				const attemptMessages =
					nudges === 0
						? sourceMessages
						: [
								...sourceMessages,
								{ role: 'assistant', content: summary },
								{
									role: 'user',
									content: `The previous summary did not meet the target: it used ${summaryTokens} baseline tokens and must be at most ${targetTokens}. Rewrite it more aggressively, preserving important requirements, decisions, and facts. Return only the summary. Do not call tools.`,
								},
							];
				const result = await this.config.llmProvider.generateText({
					config: {
						model: this.config.model,
						systemPrompt,
						availableTools: [],
					},
					messages: attemptMessages,
				});

				summary = result.reply;
				summaryTokens = this.tokenizer.tokenize(summary).length;
				factorMet = summary.trim().length > 0 && summaryTokens <= targetTokens;
				if (factorMet || nudges >= MAX_NUDGE_RETRIES) break;
				nudges++;
			}

			outcome = factorMet ? 'success' : 'factor_not_met';
			compactioninput.compactedResult = [
				{
					role: 'user',
					content: summary,
				},
			];
			return compactioninput;
		} finally {
			const attributes = { 'compaction.summary.outcome': outcome };
			this.nudgeCount.record(nudges, attributes);
			this.summaryOutcomes.add(1, attributes);
			getActiveSpan()?.setAttributes({
				'compaction.summary.nudges': nudges,
				'compaction.summary.original_tokens': originalTokenCount,
				'compaction.summary.target_tokens': targetTokens,
				'compaction.summary.result_tokens': summaryTokens,
				'compaction.summary.factor_met': factorMet,
			});
		}
	}

	packageSummary = (summary: string) => `<handoff><summary>${summary}</summary></handoff>`;
}
