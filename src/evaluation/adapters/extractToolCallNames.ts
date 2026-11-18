import type { ModelConversationMessage } from '@agent/agentConfig/Interfaces';

export function extractToolCallNames(messages: ModelConversationMessage[]): string[] {
	return messages.flatMap((message) => {
		if (message.role !== 'assistant' || !Array.isArray(message.content)) return [];
		return message.content.flatMap((part) =>
			part.type === 'tool-call' && typeof part.toolName === 'string' ? [part.toolName] : [],
		);
	});
}
