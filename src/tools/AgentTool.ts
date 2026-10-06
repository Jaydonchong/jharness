import z from "zod";

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
        await this.config.inputSchema.parseAsync(input);
    }

    protected abstract execute(input: z.infer<TSchema>): Promise<TResult>;

    public async useTool(input: z.infer<TSchema>, {}): Promise<TResult> {
        await this._validate(input);
        return await this.execute(input);
    }
}
