import type { AgentSession } from '@harness/core/AgentSession';
import type { EvaluationTarget } from '@evaluation/core/Contracts';

type EvaluationSession = Pick<AgentSession<unknown>, 'id' | 'messages' | 'sendMessage'>;

export class AgentSessionEvaluationTarget implements EvaluationTarget {
	public constructor(
		private readonly createSession: (context: {
			suiteId: string;
			caseId: string;
		}) => EvaluationSession,
	) {}

	public async run(input: string, context: { suiteId: string; caseId: string }) {
		const session = this.createSession(context);
		let response;
		let error: string | undefined;
		try {
			response = await session.sendMessage(input);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}

		return {
			text: response?.reply ?? '',
			structuredOutput: response?.output,
			error,
			metadata: {
				sessionId: session.id,
				toolCalls: session.messages.flatMap((message) => {
					if (message.role !== 'assistant' || !Array.isArray(message.content)) return [];
					return message.content.flatMap((part) =>
						part.type === 'tool-call' && typeof part.toolName === 'string'
							? [part.toolName]
							: [],
					);
				}),
			},
		};
	}
}
