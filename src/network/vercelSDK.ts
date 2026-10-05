import { LanguageModel, generateText, ModelMessage } from "ai";

export enum VERCEL_AI_PROVIDERS {
    OPENAI = "openai",
    OPENCODE = "opencode",
}

export enum VERCEL_AI_MODELS {
    GPT_6_LUNA = "gpt-6-luna",
    GPT_6_SOL = "gpt-6-sol",
    DS_V4_FLASH = "deepseek-v4-flash",
    DS_V4_PRO = "deepseek-v4-pro",

    // Free model from AI Gateway
    LING_3_1 = "inclusionai/ling-3.1-flash-free",
}

export class VercelSDK {
    public constructor(
        private readonly _INSTRUCTIONS: string,
        private readonly model: LanguageModel = VERCEL_AI_MODELS.LING_3_1,
    ) {}

    public async promptText(prompt: string): Promise<string> {
        try {
            const result = await generateText({
                model: this.model,
                instructions: this._INSTRUCTIONS,
                prompt,
            });
            console.info(`PromptText Succeeded with Finish Reason`, {
                finishReason: result.steps[0].finishReason,
            });

            this._verifyEmptyFinalStep(result);

            return result.text;
        } catch (error) {
            console.error(`PromptText Error while calling AI Gateway`, {
                error,
            });
            return `ERROR: Unable to CALL`;
        }
    }

    public async promptMessage(
        messages: {
            role: string;
            content: string;
        }[],
    ): Promise<string> {
        try {
            const result = await generateText({
                model: this.model,
                instructions: this._INSTRUCTIONS,
                messages: messages as ModelMessage[],
            });
            console.info(`promptMessage Succeeded with Finish Reason`, {
                finishReason: result.steps[0].finishReason,
                responseMesasge: result.responseMessages,
            });

            this._verifyEmptyFinalStep(result);

            return result.text;
        } catch (error) {
            console.error(`promptMessage Error while calling AI Gateway`, {
                error,
            });
            return `ERROR: Unable to CALL`;
        }
    }

    _verifyEmptyFinalStep(result: Awaited<ReturnType<typeof generateText>>) {
        if (result.text.length === 0 && result.finalStep.content.length > 0) {
            console.warn({
                finalStepContent: result.finalStep.content,
            });
            throw new Error(
                `${ERROR_CODE.UNEXPECTED_MISSING_RESPONSE} : Signature mismatch`,
            );
        }
    }
}
