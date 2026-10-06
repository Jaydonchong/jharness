import z from "zod";
import { AgentTool } from "../tools/AgentTool";

type IAbstractAgentProps = {
    systemPrompt: string;
    agentTools: AgentTool<z.ZodType, unknown>[];
};

export abstract class AbstractAgent {
    constructor(private readonly props: IAbstractAgentProps) {}

    public get systemPrompt(): string {
        return this.props.systemPrompt;
    }

    public get agentTools(): AgentTool<z.ZodType, unknown>[] {
        return this.props.agentTools;
    }
}
