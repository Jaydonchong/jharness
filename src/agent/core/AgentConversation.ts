import type { AbstractAgentConfig } from '../agentConfig/AbstractAgentConfig';
import type { ModelConversationMessage } from '../agentConfig/Interfaces';
import type { CompactionTokenStats } from '../../compaction/core/Interfaces';

export type AgentConversationCompaction = {
	compactedMessaage: string;
	retainedMessages: ModelConversationMessage[];
	tokenStats: CompactionTokenStats;
};

export type AgentConversationCompactor = (
	messages: ModelConversationMessage[],
	conversationCheckpoint: string,
	agent: AbstractAgentConfig,
	comparisonSystemPrompt: string,
) => Promise<AgentConversationCompaction>;

export class AgentConversation {
	private conversationMessages: ModelConversationMessage[] = [];
	private conversationCheckpoint = '';

	public get messages(): ModelConversationMessage[] {
		return this.conversationMessages;
	}

	public append(messages: ModelConversationMessage | ModelConversationMessage[]): void {
		this.conversationMessages.push(...(Array.isArray(messages) ? messages : [messages]));
	}

	public replaceMessages(messages: ModelConversationMessage[]): void {
		this.conversationMessages = messages;
	}

	public get currentMessage(): ModelConversationMessage | undefined {
		for (let index = this.conversationMessages.length - 1; index >= 0; index--) {
			if (this.conversationMessages[index].role === 'user') {
				return this.conversationMessages[index];
			}
		}
		return undefined;
	}

	public buildProviderSystemPrompt(systemPrompt: string): string {
		return [systemPrompt, this.conversationCheckpoint].filter(Boolean).join('\n');
	}

	public async compact(
		compact: AgentConversationCompactor,
		agent: AbstractAgentConfig,
		comparisonSystemPrompt: string,
	): Promise<AgentConversationCompaction> {
		const result = await compact(
			this.conversationMessages,
			this.conversationCheckpoint,
			agent,
			comparisonSystemPrompt,
		);
		this.conversationCheckpoint = result.compactedMessaage;
		this.conversationMessages = result.retainedMessages;
		return result;
	}
}
