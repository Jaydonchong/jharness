/**
 * Based off of : https://compact-prompt.readthedocs.io/en/latest/
 */

import { ModelConversationMessage } from "../../agents/Interfaces";
import { CompactionPipeline } from "./CompactionPipeline";
import { CompactionInput, CompactionOutput } from "./Interfaces";

export class CompactionEngine {
    //TODO: Move to init once we have more pipeline
    public constructor(private readonly basePipeline: CompactionPipeline) {}

    public async compactConversation(input: CompactionInput): Promise<{
        compacted: string;
        recentMessage: ModelConversationMessage[];
    }> {
        let compactionResult = await this.basePipeline.run(input);
        return {
            compacted: this._deserializeCompactionResult(compactionResult),
            recentMessage: compactionResult.recentMessages,
        };
    }

    private _deserializeCompactionResult(output: CompactionOutput): string {
        return output.compactedResult
            .map((m) => m.content as string)
            .join("\n");
    }
}
