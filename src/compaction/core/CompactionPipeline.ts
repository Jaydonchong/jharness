import { DomainError, ErrorCode } from '../../utils/ErrorCode';
import { AbstractCompactionPipelineNode } from './AbstractCompactionPipelineNode';
import { CompactionInput, CompactionOutput, createEmptyCompactionOutput } from './Interfaces';
import { getActiveSpan, getMeter } from '../../telemetry/Telemetry';
import { TraceScope, WithSpan } from '../../telemetry/Decorators';

@TraceScope('compaction-pipeline')
export class CompactionPipeline {
	public tail: AbstractCompactionPipelineNode | null = null;
	public head: AbstractCompactionPipelineNode | null = null;
	private readonly meter = getMeter('compaction-pipeline');
	private readonly pipelineCounter = this.meter.createCounter('compaction.pipeline.count', {
		description: 'Number of compaction pipeline runs',
		unit: '{operation}',
	});
	private readonly pipelineDuration = this.meter.createHistogram('compaction.pipeline.duration', {
		description: 'Duration of compaction pipeline runs',
		unit: 's',
	});
	private readonly nodeDuration = this.meter.createHistogram(
		'compaction.pipeline.node.duration',
		{
			description: 'Duration of individual compaction pipeline nodes',
			unit: 's',
		},
	);

	constructor() {}

	public addNode(node: AbstractCompactionPipelineNode): this {
		if (!this.tail) {
			this.tail = node;
			this.head = node;
			return this;
		}
		this.tail.next = node;
		this.tail = node;
		return this;
	}

	@WithSpan('compaction.pipeline')
	public async run(input: CompactionInput): Promise<CompactionOutput> {
		const span = getActiveSpan();
		const startedAt = performance.now();
		let outcome: 'success' | 'error' = 'success';
		try {
			if (!this.head)
				throw new DomainError(
					ErrorCode.COMPACTION_SETUP_ERROR,
					'compaction:empty pipeline ran',
				);

			let track: AbstractCompactionPipelineNode | null = this.head;
			let compactedMessage = createEmptyCompactionOutput(input);
			// Start with full conversation
			compactedMessage.compactedResult = input.messages;
			span?.setAttribute('compaction.input_message_count', input.messages.length);

			// Short circuit when there is nothing left to compact.
			while (track != null && compactedMessage.compactedResult.length > 0) {
				const node: AbstractCompactionPipelineNode = track;
				compactedMessage = await this.executeNode(node, compactedMessage);
				track = node.next;
			}

			span?.setAttribute(
				'compaction.output_message_count',
				compactedMessage.compactedResult.length,
			);
			return compactedMessage;
		} catch (error) {
			outcome = 'error';
			throw error;
		} finally {
			const attributes = { 'compaction.outcome': outcome };
			this.pipelineCounter.add(1, attributes);
			this.pipelineDuration.record((performance.now() - startedAt) / 1000, attributes);
		}
	}

	@WithSpan((instance, args) => {
		const node = args[0] as AbstractCompactionPipelineNode;
		return `compaction.pipeline.node.${node.name}`;
	})
	private async executeNode(
		node: AbstractCompactionPipelineNode,
		input: CompactionOutput,
	): Promise<CompactionOutput> {
		const span = getActiveSpan();
		const startedAt = performance.now();
		let outcome: 'success' | 'error' = 'success';
		try {
			span?.setAttribute('compaction.input_message_count', input.compactedResult.length);
			const output = await node.execute(input);
			span?.setAttribute('compaction.output_message_count', output.compactedResult.length);
			return output;
		} catch (error) {
			outcome = 'error';
			throw error;
		} finally {
			this.nodeDuration.record((performance.now() - startedAt) / 1000, {
				'compaction.node.name': node.name,
				'compaction.outcome': outcome,
			});
		}
	}
}
