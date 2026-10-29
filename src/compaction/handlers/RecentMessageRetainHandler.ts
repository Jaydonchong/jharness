import { AbstractCompactionPipelineNode } from "../core/AbstractCompactionPipelineNode";
import { CompactionOutput } from "../core/Interfaces";

type RecentMessageRetainerHandlerProps = {
    threshold: number; // How many user messages to retain
};

/**
 * Treat an exchange as the user message plus the assistant and tool messages that follow it
 * so the cutoff doesn’t split a tool call from its result.
 */
export class RecentMessageRetainHandler extends AbstractCompactionPipelineNode {
    constructor(private readonly config: RecentMessageRetainerHandlerProps) {
        super();
    }

    public execute(input: CompactionOutput): Promise<CompactionOutput> {
        let counter = this.config.threshold;
        let i = input.compactedResult.length - 1;
        let messages = input.compactedResult;

        // NOTE: this design will comppact previous compaction
        while (counter > 0 && i > 0) {
            if (messages[i].role == "user") {
                counter--;
            }
            i--;
        }
        const recentMessages = input.compactedResult.slice(i);
        // Edit in place for memory preservation
        input.recentMessages = recentMessages;
        return Promise.resolve(input);
    }
}
