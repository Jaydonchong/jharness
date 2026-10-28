import z from "zod";
import { AgentTool } from "../tools/AgentTool";
import { DomainError, ErrorCode } from "../utils/ErrorCode";

type IAbstractAgentProps = {
    systemPrompt: string;
    agentTools: AgentTool<z.ZodType, z.ZodType>[];
    /**
     * Optional Zod schema constraining the agent's final output.
     * Applied by AgentSession as the model's structured-output spec.
     */
    outputSchema?: z.ZodType;
    /**
     * For appending dynamic context
     * Context: Ran into issue where GcalSummarizer thought year was 2025 based on training data
     * Appending the date to system prompt will affect caching, hence better approach is to append
     * on new message
     */
    onMessage?: (msg: string) => Promise<string>;
};

export abstract class AbstractAgent {
    public toolRegistry: Map<string, AgentTool<z.ZodType, z.ZodType>> =
        new Map();

    constructor(private readonly props: IAbstractAgentProps) {
        this.agentTools.forEach((tool) =>
            this.toolRegistry.set(tool.name, tool),
        );
    }

    public get systemPrompt(): string {
        return this.props.systemPrompt;
    }

    public get agentTools(): AgentTool<z.ZodType, z.ZodType>[] {
        return this.props.agentTools;
    }

    public get outputSchema(): z.ZodType | undefined {
        return this.props.outputSchema;
    }

    public get onMessage(): (msg: string) => Promise<string> {
        return this.props.onMessage
            ? this.props.onMessage
            : (msg: string) => Promise.resolve(msg); // Default do nothing
    }

    public getTool(toolName: string) {
        const tool = this.toolRegistry.get(toolName);
        if (!tool)
            throw new DomainError(
                ErrorCode.AI_TOOL_CALL_ERROR,
                `Unable to find invoked tool: ${toolName}`,
            );
        return tool;
    }
}
