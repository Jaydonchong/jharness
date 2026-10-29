import z from "zod";
import { asDomainError, ErrorCode } from "../utils/ErrorCode";
import logger from "../utils/Logger";

export type IAgentTool<
    TInputSchema extends z.ZodType,
    TOutputSchema extends z.ZodType,
> = {
    name: string;
    description?: string;
    inputSchema: TInputSchema;
    outputSchema: TOutputSchema;
};

export abstract class AgentTool<
    TInputSchema extends z.ZodType,
    TOutputSchema extends z.ZodType,
> {
    constructor(
        public readonly config: IAgentTool<TInputSchema, TOutputSchema>,
    ) {}

    public get name(): string {
        return this.config.name;
    }

    public get description(): string {
        return this.config.description ?? "";
    }

    public get inputSchema(): TInputSchema {
        return this.config.inputSchema;
    }

    public get outputSchema(): TOutputSchema {
        return this.config.outputSchema;
    }

    private async _validateInput(input: z.infer<TInputSchema>): Promise<void> {
        try {
            await this.config.inputSchema.parseAsync(input);
        } catch (error) {
            throw asDomainError(
                error,
                ErrorCode.VALIDATION_ERROR,
                "Invalid tool input",
            );
        }
    }

    private async _validateOutput(
        output: unknown,
    ): Promise<z.infer<TOutputSchema>> {
        try {
            return await this.config.outputSchema.parseAsync(output);
        } catch (error) {
            throw asDomainError(
                error,
                ErrorCode.VALIDATION_ERROR,
                "Invalid tool output",
            );
        }
    }

    private async _preToolCheck(
        input: z.infer<TInputSchema>,
    ): Promise<z.infer<TInputSchema>> {
        // Default checks for all tool
        await this._validateInput(input);
        logger.info("tool:call:start", {
            input,
            name: this.name,
        });

        /**
         * TODO:
         * Decide if permission checking should be handled here or the harness
         * Decide if formatting is needed
         */
        return input;
    }

    private async _postToolCheck(
        input: z.infer<TInputSchema>,
        output: unknown,
    ): Promise<z.infer<TOutputSchema>> {
        const validatedOutput = await this._validateOutput(output);
        logger.info("tool:call:success", {
            input,
            output: validatedOutput,
            name: this.name,
        });
        return validatedOutput;
    }
    
    // TODO : Keep each tool's compaction strategy here 
    // i.e. Freshness requirement and summarization
    protected abstract execute(
        input: z.infer<TInputSchema>,
    ): Promise<z.infer<TOutputSchema>>;

    public async useTool(
        input: z.infer<TInputSchema>,
    ): Promise<z.infer<TOutputSchema>> {
        try {
            const processedInput = await this._preToolCheck(input);
            const result = await this.execute(processedInput);
            return await this._postToolCheck(processedInput, result);
        } catch (error) {
            throw asDomainError(
                error,
                ErrorCode.AI_TOOL_CALL_ERROR,
                "Tool execution failed",
            );
        }
    }
}
