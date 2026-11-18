import type { AgentSession } from '@harness/core/AgentSession';
import type { EvaluationTarget } from '@evaluation/core/Contracts';
import { extractToolCallNames } from './extractToolCallNames';

type EvaluationSession = Pick<AgentSession<unknown>, 'id' | 'messages' | 'sendMessage'>;

export class AgentSessionEvaluationTarget implements EvaluationTarget {
	public constructor(
		private readonly createSession: (context: {
			suiteId: string;
			taskId: string;
		}) => EvaluationSession,
	) {}

	public async run(input: string, context: { suiteId: string; taskId: string }) {
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
				toolCalls: extractToolCallNames(session.messages),
			},
		};
	}
}
