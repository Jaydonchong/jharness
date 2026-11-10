import { DomainError, ErrorCode } from '../../utils/ErrorCode';
import { AbstractCompactionPipelineNode } from './AbstractCompactionPipelineNode';
import { CompactionInput, CompactionOutput, createEmptyCompactionOutput } from './Interfaces';
import { getMeter, getTracer } from '../../telemetry/Telemetry';

export class CompactionPipeline {
	public tail: AbstractCompactionPipelineNode | null = null;
	public head: AbstractCompactionPipelineNode | null = null;
	private readonly tracer = getTracer('compaction-pipeline');
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

	public async run(input: CompactionInput): Promise<CompactionOutput> {
		return this.tracer.startActiveSpan('compaction.pipeline', async (span) => {
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
				span.setAttribute('compaction.input_message_count', input.messages.length);

				// Short circuit when there is nothing left to compact.
				while (track != null && compactedMessage.compactedResult.length > 0) {
					const node: AbstractCompactionPipelineNode = track;
					compactedMessage = await this.tracer.startActiveSpan(
						`compaction.pipeline.node.${node.name}`,
						async (nodeSpan) => {
							const nodeStartedAt = performance.now();
							let nodeOutcome: 'success' | 'error' = 'success';
							try {
								nodeSpan.setAttribute(
									'compaction.input_message_count',
									compactedMessage.compactedResult.length,
								);
								const output = await node.execute(compactedMessage);
								nodeSpan.setAttribute(
									'compaction.output_message_count',
									output.compactedResult.length,
								);
								return output;
							} catch (error) {
								nodeOutcome = 'error';
								throw error;
							} finally {
								this.nodeDuration.record(
									(performance.now() - nodeStartedAt) / 1000,
									{
										'compaction.node.name': node.name,
										'compaction.outcome': nodeOutcome,
									},
								);
							}
						},
					);
					track = node.next;
				}

				span.setAttribute(
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
		});
	}
}
