import { LanguageModel } from "ai";
import z from "zod";
import { ModelConversationMessage } from "../../agents/Interfaces";
import { AgentTool } from "../../tools/AgentTool";

export type ILlmGenerateTextInput<TModelType> = {
    config: {
        model: TModelType;
        systemPrompt?: string;
        availableTools: AgentTool<z.ZodType, unknown>[];
    };
    messages: ModelConversationMessage[];
};
export type ILlmGenerateTextOutput = {
    messages: ModelConversationMessage[];
};

export type ILlmProvider = {
    generateText(
        arg: ILlmGenerateTextInput<LanguageModel>,
    ): Promise<ILlmGenerateTextOutput>;
};
