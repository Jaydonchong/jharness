import { isDeepStrictEqual } from "node:util";
import { ModelConversationMessage } from "../../agents/Interfaces";
import { AbstractCompactionPipelineNode } from "../core/AbstractCompactionPipelineNode";
import { CompactionOutput } from "../core/Interfaces";

type ToolCallContent = {
    type: "tool-call";
    toolCallId: string;
    toolName: string;
    input: unknown;
};

type ToolResultContent = {
    type: "tool-result";
    toolCallId: string;
    toolName?: string;
    output: unknown;
};

const isToolCallContent = (value: unknown): value is ToolCallContent =>
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "tool-call" &&
    "toolCallId" in value &&
    typeof value.toolCallId === "string" &&
    "toolName" in value &&
    typeof value.toolName === "string" &&
    "input" in value;

const isToolResultContent = (value: unknown): value is ToolResultContent =>
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "tool-result" &&
    "toolCallId" in value &&
    typeof value.toolCallId === "string" &&
    "output" in value;

export class DedupeRepeatedContent extends AbstractCompactionPipelineNode {
    public async execute(input: CompactionOutput): Promise<CompactionOutput> {
        const toolCalls = new Map<string, ToolCallContent>();

        for (const message of input.compactedResult) {
            if (message.role !== "assistant" || !Array.isArray(message.content)) {
                continue;
            }

            for (const content of message.content) {
                if (isToolCallContent(content)) {
                    toolCalls.set(content.toolCallId, content);
                }
            }
        }

        const seenCalls: Array<{
            toolName: string;
            input: unknown;
            output: unknown;
        }> = [];
        const duplicateCallIds = new Set<string>();

        for (const message of input.compactedResult) {
            if (message.role !== "tool" || !Array.isArray(message.content)) {
                continue;
            }

            for (const content of message.content) {
                if (!isToolResultContent(content)) continue;

                const toolCall = toolCalls.get(content.toolCallId);
                if (!toolCall) continue;

                const pair = {
                    toolName: content.toolName ?? toolCall.toolName,
                    input: toolCall.input,
                    output: content.output,
                };
                if (
                    seenCalls.some((seen) =>
                        isDeepStrictEqual(seen, pair),
                    )
                ) {
                    duplicateCallIds.add(content.toolCallId);
                } else {
                    seenCalls.push(pair);
                }
            }
        }

        input.compactedResult = input.compactedResult
            .map((message): ModelConversationMessage | null => {
                if (!Array.isArray(message.content)) return message;

                const content = message.content.filter((part) => {
                    if (
                        message.role === "assistant" &&
                        isToolCallContent(part)
                    ) {
                        return !duplicateCallIds.has(part.toolCallId);
                    }
                    if (message.role === "tool" && isToolResultContent(part)) {
                        return !duplicateCallIds.has(part.toolCallId);
                    }
                    return true;
                });

                return content.length > 0 ? { ...message, content } : null;
            })
            .filter(
                (message): message is ModelConversationMessage =>
                    message !== null,
            );

        return input;
    }
}
