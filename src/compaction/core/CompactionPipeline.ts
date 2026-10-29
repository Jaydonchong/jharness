import { DomainError, ErrorCode } from "../../utils/ErrorCode";
import { AbstractCompactionPipelineNode } from "./AbstractCompactionPipelineNode";
import {
    CompactionInput,
    CompactionOutput,
    createEmptyCompactionOutput,
} from "./Interfaces";

export class CompactionPipeline {
    public tail: AbstractCompactionPipelineNode | null = null;
    public head: AbstractCompactionPipelineNode | null = null;

    constructor() {}

    public addNode(node: AbstractCompactionPipelineNode):this {
        if (!this.tail) {
            this.tail = node;
            this.head = node;
            return this;
        }
        this.tail.next = node;
        this.tail = node;
        return this
    }

    public async run(input: CompactionInput): Promise<CompactionOutput> {
        if (!this.head)
            throw new DomainError(
                ErrorCode.COMPACTION_SETUP_ERROR,
                "compaction:empty pipeline ran",
            );

        let track: AbstractCompactionPipelineNode | null = this.head;
        let compactedMessage = createEmptyCompactionOutput(input);
        // Start with full conversation
        compactedMessage.compactedResult = input.messages

        // Short circuit if nothing more to compact, such as in the case where all messages should be retained as is
        while (track != null && compactedMessage.compactedResult.length > 0) {
            compactedMessage = await track.execute(compactedMessage);
            track = track.next;
        }
        return compactedMessage;
    }
}
