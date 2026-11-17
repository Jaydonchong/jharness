/**
 * Based off of : https://compact-prompt.readthedocs.io/en/latest/
 */

import { ModelConversationMessage } from '../../agent/agentConfig/Interfaces';
import { BaselineTokenizer } from '../../utils/BaselineTokenizer';
import { CompactionPipeline } from './CompactionPipeline';
import { CompactionInput, CompactionOutput, CompactionTokenStats } from './Interfaces';
import { getActiveSpan, getMeter } from '../../telemetry/Telemetry';

export class CompactionEngine {
	private readonly tokenizer = new BaselineTokenizer();
	private readonly meter = getMeter('compaction-engine');
	private readonly tokensBefore = this.meter.createHistogram('compaction.tokens.before', {
		description: 'Baseline tokens in the conversation context before compaction',
		unit: '{token}',
	});
	private readonly tokensAfter = this.meter.createHistogram('compaction.tokens.after', {
		description: 'Baseline tokens in the conversation context after compaction',
		unit: '{token}',
	});
	private readonly tokensSaved = this.meter.createHistogram('compaction.tokens.saved', {
		description: 'Baseline tokens removed by compaction; negative values indicate growth',
		unit: '{token}',
	});
	private readonly reductionRatio = this.meter.createHistogram(
		'compaction.token.reduction.ratio',
		{
			description: 'Share of baseline context tokens removed by compaction',
			unit: '1',
		},
	);

	//TODO: Move to init once we have more pipeline
	public constructor(private readonly basePipeline: CompactionPipeline) {}

	public async compactConversation(input: CompactionInput): Promise<{
		compacted: string;
		recentMessage: ModelConversationMessage[];
		tokenStats: CompactionTokenStats;
	}> {
		const systemPrompt = input.comparisonSystemPrompt ?? input.systemPrompt;
		const beforeTokens = this.tokenizer.tokenize(
			this.formatConversationText(
				systemPrompt,
				input.conversationCheckpoint ?? '',
				input.messages,
			),
		).length;
		const compactionResult = await this.basePipeline.run({
			...input,
			originalTokenCount: beforeTokens,
		});
		const compacted = this._deserializeCompactionResult(compactionResult);
		const recentMessage = compactionResult.recentMessages;
		const afterTokens = this.tokenizer.tokenize(
			this.formatConversationText(systemPrompt, compacted, recentMessage),
		).length;
		const tokensSaved = beforeTokens - afterTokens;
		const reductionPercent =
			beforeTokens === 0 ? null : Math.round((tokensSaved / beforeTokens) * 100);
		const attributes = { 'compaction.outcome': 'success' };
		this.tokensBefore.record(beforeTokens, attributes);
		this.tokensAfter.record(afterTokens, attributes);
		this.tokensSaved.record(tokensSaved, attributes);
		if (beforeTokens > 0) {
			this.reductionRatio.record(tokensSaved / beforeTokens, attributes);
		}
		getActiveSpan()?.setAttributes({
			'compaction.tokens.before': beforeTokens,
			'compaction.tokens.after': afterTokens,
			'compaction.tokens.saved': tokensSaved,
			...(reductionPercent === null
				? {}
				: { 'compaction.token.reduction.percent': reductionPercent }),
		});
		return {
			compacted,
			recentMessage,
			tokenStats: {
				beforeTokens,
				afterTokens,
				tokensSaved,
				reductionPercent,
			},
		};
	}

	public async compactMemory(input: CompactionInput): Promise<string> {
		throw new Error('Not Implemented');
	}

	private _deserializeCompactionResult(output: CompactionOutput): string {
		return output.compactedResult.map((m) => m.content as string).join('\n');
	}

	private formatConversationText(
		systemPrompt: string,
		conversationCheckpoint: string,
		messages: ModelConversationMessage[],
	): string {
		const messageText = messages
			.map(({ role, content }) => {
				const contentText = typeof content === 'string' ? content : JSON.stringify(content);
				return `${role}\n${contentText}`;
			})
			.join('\n');

		return [systemPrompt, conversationCheckpoint, messageText].join('\n');
	}
}
