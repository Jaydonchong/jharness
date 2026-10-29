/**
 * Based off of : https://compact-prompt.readthedocs.io/en/latest/
 */

import { CompactionPipeline } from "./CompactionPipeline";
import {
    CompactionInput,
    CompactionOutput,
    createEmptyCompactionOutput,
} from "./Interfaces";

export class CompactionEngine {
    private pipeline: CompactionPipeline = new CompactionPipeline();

    public async compactPrompt(
        input: CompactionInput,
    ): Promise<CompactionOutput> {
        return createEmptyCompactionOutput(input);
    }
}
