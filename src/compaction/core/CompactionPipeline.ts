import { DomainError, ErrorCode } from '../../utils/ErrorCode';
import { AbstractCompactionPipelineNode } from './AbstractCompactionPipelineNode';
import { CompactionInput, CompactionOutput, createEmptyCompactionOutput } from './Interfaces';
import { getTracer } from '../../telemetry/Telemetry';

export class CompactionPipeline {
	public tail: AbstractCompactionPipelineNode | null = null;
	public head: AbstractCompactionPipelineNode | null = null;
	private readonly tracer = getTracer('compaction-pipeline');

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
					},
				);
				track = node.next;
			}

			span.setAttribute(
				'compaction.output_message_count',
				compactedMessage.compactedResult.length,
			);
			return compactedMessage;
		});
	}
}
