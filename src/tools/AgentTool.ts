import z from "zod";
import { asDomainError, ErrorCode } from "../utils/ErrorCode";

export type IAgentTool<TSchema extends z.ZodType> = {
    name: string;
    description?: string;
    inputSchema: TSchema;
};

export abstract class AgentTool<TSchema extends z.ZodType, TResult = void> {
    constructor(public readonly config: IAgentTool<TSchema>) {}

    public get name(): string {
        return this.config.name;
    }

    public get description(): string {
        return this.config.description ?? "";
    }

    public get inputSchema(): TSchema {
        return this.config.inputSchema;
    }

    private async _validate(input: z.infer<TSchema>): Promise<void> {
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

    private async _preToolCheck(
        input: z.infer<TSchema>,
    ): Promise<z.infer<TSchema>> {
        // Default checks for all tool
        await this._validate(input);

        /**
         * TODO:
         * Decide if permission checking should be handled here or the harness
         * Decide if formatting is needed
         */
        return input;
    }

    private async _postToolCheck(
        input: z.infer<TSchema>,
        output: TResult,
    ): Promise<TResult> {
        return output;
    }

    protected abstract execute(input: z.infer<TSchema>): Promise<TResult>;

    public async useTool(input: z.infer<TSchema>, {}): Promise<TResult> {
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
