import { CompactionOutput } from './Interfaces';

export abstract class AbstractCompactionPipelineNode {
	public abstract readonly name: string;

	next: AbstractCompactionPipelineNode | null = null;

	public setNext(node: AbstractCompactionPipelineNode) {
		this.next = node;
	}

	public abstract execute(messages: CompactionOutput): Promise<CompactionOutput>;
}
