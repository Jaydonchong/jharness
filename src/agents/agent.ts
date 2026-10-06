type IAbstractAgentDeps = {
    systemPrompt: string;
};

export abstract class AbstractAgent {
    constructor(private readonly deps: IAbstractAgentDeps) {}

    
}
