import { ILlmProvider } from "../../network/llmProviders/Interfaces";
import { AbstractCompactionPipelineNode } from "../core/AbstractCompactionPipelineNode";
import { buildPrompt } from "../core/Compaction.prompt";
import { CompactionOutput } from "../core/Interfaces";

type ModelSummarizerConfig<TModelType> = {
    llmProvider: ILlmProvider<TModelType>;
    model: TModelType;
};

export class ModelSummarizer<
    TModelType,
> extends AbstractCompactionPipelineNode {
    constructor(private readonly config: ModelSummarizerConfig<TModelType>) {
        super();
    }

    public async execute(
        compactioninput: CompactionOutput,
    ): Promise<CompactionOutput> {
        if (compactioninput.compactedResult.length === 0)
            return compactioninput;

        const systemPrompt = buildPrompt(
            compactioninput.input.systemPrompt.content as string,
            compactioninput.compactedResult,
        );

        const result = await this.config.llmProvider.generateText({
            config: {
                model: this.config.model,
                systemPrompt: systemPrompt,
                availableTools: [],
            },
            messages: compactioninput.compactedResult,
        });

        compactioninput.compactedResult = [
            {
                role: "user",
                content: result.reply,
            },
        ];
        return compactioninput;
    }

    packageSummary = (summary: string) =>
        `<handoff><summary>${summary}</summary></handoff>`;
}
