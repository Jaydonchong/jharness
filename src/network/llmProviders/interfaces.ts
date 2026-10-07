import { LanguageModel } from "ai";
import z from "zod";
import { ModelConversationMessage } from "../../agents/Interfaces";
import { AgentTool } from "../../tools/AgentTool";

export enum LlmTextStopReason {
    STOP = "stop", // Finished
    LENGTH = "length", // Exceeded token limit
    CONTENT_FILTER = "content-filter",
    TOOL_CALL = "tool-calls",
    ERROR = "error",
    OTHER = "other",
}

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
    reply: string;
    stopReason: LlmTextStopReason;
};

export type ILlmProvider<TModelType> = {
    generateText(
        arg: ILlmGenerateTextInput<TModelType>,
    ): Promise<ILlmGenerateTextOutput>;
    streamText(
        arg: ILlmStreamTextInput<TModelType>,
    ): Promise<ILlmStreamTextOutput>;
};

export type ILlmStreamTextInput<TModelType> = {
    config: {
        model: TModelType;
        systemPrompt?: string;
        availableTools: AgentTool<z.ZodType, unknown>[];
    };
    messages: ModelConversationMessage[];
};

export type ILlmStreamTextOutput = {
    reply: AsyncIterable<string>;
    completed: Promise<{
        messages: ModelConversationMessage[];
        stopReason: LlmTextStopReason;
    }>;
};
