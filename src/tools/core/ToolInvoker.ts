import { AbstractAgent } from "../../agents/AbstractAgent";
import { ModelConversationMessage } from "../../agents/Interfaces";
import { ILlmToolCall } from "../../providers/Interfaces";
import { AgentToolExecutionContext } from "./AgentTool";

const DEFAULT_MAX_RETRIES = 3;

export type ToolInvokerOptions = {
    maxRetries?: number;
    shouldRetry?: (error: unknown, toolCall: ILlmToolCall) => boolean;
};

export class ToolInvoker {
    private readonly maxRetries: number;

    constructor(
        private readonly agent: AbstractAgent,
        private readonly context: AgentToolExecutionContext,
        private readonly options: ToolInvokerOptions = {},
    ) {
        this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    }

    public async invoke(
        toolCalls: ILlmToolCall[],
    ): Promise<ModelConversationMessage> {
        const toolCallResults: Record<string, unknown>[] = [];

        for (const toolCall of toolCalls) {
            const tool = this.agent.getTool(toolCall.name);
            let retries = 0;

            while (true) {
                try {
                    const result = await tool.useTool(
                        toolCall.input,
                        this.context,
                    );
                    toolCallResults.push({
                        type: "tool-result",
                        toolCallId: toolCall.id,
                        toolName: toolCall.name,
                        output: {
                            type: "json",
                            value: result,
                        },
                    });
                    break;
                } catch (error) {
                    if (
                        retries >= this.maxRetries ||
                        !this.options.shouldRetry?.(error, toolCall)
                    ) {
                        throw error;
                    }

                    retries++;
                }
            }
        }

        return {
            role: "tool",
            content: toolCallResults,
        };
    }
}
