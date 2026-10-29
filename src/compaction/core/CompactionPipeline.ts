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

    public addNode(node: AbstractCompactionPipelineNode) {
        if (!this.tail) {
            this.tail = node;
            this.head = node;
            return;
        }
        this.tail.next = node;
        this.tail = node;
    }

    public async run(input: CompactionInput): Promise<CompactionOutput> {
        if (!this.head)
            throw new DomainError(
                ErrorCode.COMPACTION_SETUP_ERROR,
                "compaction:empty pipeline ran",
            );

        let track: AbstractCompactionPipelineNode | null = this.head;
        let compactedMessage = createEmptyCompactionOutput(input);

        const haveMessagesToCompact =
            compactedMessage.compactedResult.length > 0;

        while (track != null && haveMessagesToCompact) {
            compactedMessage = await track.execute(compactedMessage);
            track = track.next;
        }
        return compactedMessage;
    }
}
