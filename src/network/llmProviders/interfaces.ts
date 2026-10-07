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

export enum LlmTextStopReason {
    STOP = "stop", // Finished
    LENGTH = "length", // Exceeded token limit
    CONTENT_FILTER = "content-filter",
    TOOL_CALL = "tool-calls",
    ERROR = "error",
    OTHER = "other",
}

export type ILlmGenerateTextOutput = {
    messages: ModelConversationMessage[];
    reply: string;
};

export type ILlmProvider<TModelType> = {
    generateText(
        arg: ILlmGenerateTextInput<TModelType>,
    ): Promise<ILlmGenerateTextOutput>;
};
