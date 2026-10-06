import { LanguageModel, generateText, Tool, tool, ModelMessage } from "ai";
import { AgentTool } from "../../tools/AgentTool";
import z from "zod";
import { ModelConversationMessage } from "../../agents/Interfaces";
import logger from "../../utils/Logger";

export enum VERCEL_AI_PROVIDERS {
    OPENAI = "openai",
    OPENCODE = "opencode",
}

export enum VERCEL_AI_MODELS {
    GPT_6_LUNA = "gpt-6-luna",
    GPT_6_SOL = "gpt-6-sol",
    DS_V4_FLASH = "deepseek/deepseek-v4-flash-0731",
    DS_V4_PRO = "deepseek-v4-pro",

    // Free model from AI Gateway
    LING_3_1 = "inclusionai/ling-3.1-flash-free",

    DEFAULT = "inclusionai/ling-3.0-flash",
}

export class VercelSDK {
    public constructor(
        private readonly _INSTRUCTIONS: string,
        private readonly model: LanguageModel = VERCEL_AI_MODELS.DEFAULT,
    ) {}

    public async promptText(prompt: string): Promise<string> {
        try {
            const result = await generateText({
                model: this.model,
                instructions: this._INSTRUCTIONS,
                prompt,
            });
            logger.info(`PromptText Succeeded with Finish Reason`, {
                finishReason: result.steps[0].finishReason,
            });

            this._verifyEmptyFinalStep(result);

            return result.text;
        } catch (error) {
            logger.error(`PromptText Error while calling AI Gateway`, {
                error,
            });
            return `ERROR: Unable to CALL`;
        }
    }

    /**
     * https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#types
     */
    public async promptMessage(
        messages: ModelConversationMessage[],
        availableTools: AgentTool<z.ZodType, unknown>[] = [],
    ): Promise<ModelConversationMessage[]> {
        try {
            const result = await generateText({
                model: this.model,
                instructions: this._INSTRUCTIONS,
                allowSystemInMessages: false, // Use instructions field instead
                toolChoice: "auto", // 'auto' | 'none' | 'required'
                maxRetries: 2,
                timeout: 60_000,
                include: {
                    // Contorls inclusion of fields in step result, default false for memory
                    requestBody: false,
                    requestMessages: false,
                    responseBody: false,
                },
                onStart: () => {
                    logger.info("Firing request using Vercel SDK");
                },
                onToolExecutionStart: ({ toolCall }) => {
                    logger.info("Tool call started", {
                        input: toolCall.input,
                        name: toolCall.toolName,
                    });
                },
                onToolExecutionEnd: ({ toolCall }) => {
                    logger.info("Tool call ended", {
                        input: toolCall.input,
                        name: toolCall.toolName,
                    });
                },
                tools: Object.fromEntries(
                    availableTools.map((t) => [
                        `tool_${t.name}`,
                        this.sanitizeTool(t),
                    ]),
                ),
                messages: messages as ModelMessage[],
            });
            logger.info("`promptMessage Succeeded with Finish Reason`");
            console.dir(
                {
                    finishReason: result.steps[0].finishReason,
                    responseMessage: result.responseMessages,
                },
                { depth: null, colors: true },
            );

            this._verifyEmptyFinalStep(result);

            return result.responseMessages as ModelConversationMessage[];
        } catch (error) {
            logger.error(`promptMessage Error while calling AI Gateway`, {
                error,
            });
            return [];
        }
    }

    public sanitizeTool<
        TSchema extends z.ZodType,
        TResult = void,
        TContext extends Record<string, unknown> = {},
    >(agentTool: AgentTool<TSchema, TResult>): Tool {
        return tool<z.infer<TSchema>, unknown, TContext>({
            description: agentTool.description,
            inputSchema: agentTool.inputSchema,
            execute: agentTool.useTool.bind(agentTool),
        });
    }

    _verifyEmptyFinalStep(result: Awaited<ReturnType<typeof generateText>>) {
        if (result.text.length === 0 && result.finalStep.content.length > 0) {
            logger.warn("Unexpected empty return", {
                finalStepContent: result.finalStep.content,
            });
            throw new Error(
                `${ERROR_CODE.AI_MODEL_UNEXPECTED_MISSING_RESPONSE} : Signature mismatch`,
            );
        }
    }
}
