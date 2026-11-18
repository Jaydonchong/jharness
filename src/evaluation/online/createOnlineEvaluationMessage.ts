import { isSpanContextValid, type Span } from '@opentelemetry/api';
import type { OnlineEvaluationMessage } from './Contracts';
import { DomainError, ErrorCode } from '@utils/ErrorCode';

export type OnlineEvaluationSpanData = {
	sessionId: string;
	agentName: string;
	input: string;
	output: {
		text: string;
		structuredOutput?: unknown;
	};
	completedAt: string;
};

export function createOnlineEvaluationMessage(
	span: Span,
	data: OnlineEvaluationSpanData,
): OnlineEvaluationMessage {
	const spanContext = span.spanContext();
	if (!isSpanContextValid(spanContext)) {
		throw new DomainError(
			ErrorCode.VALIDATION_ERROR,
			'Cannot enqueue online evaluation without a valid trace context',
		);
	}

	span.setAttribute('evaluation.session.id', data.sessionId);
	span.setAttribute('evaluation.agent.name', data.agentName);
	span.setAttribute('evaluation.input', data.input);
	span.setAttribute('evaluation.output.text', data.output.text);
	span.setAttribute('evaluation.completed_at', data.completedAt);

	if (data.output.structuredOutput !== undefined) {
		const structuredOutput = JSON.stringify(data.output.structuredOutput);
		if (structuredOutput !== undefined) {
			span.setAttribute('evaluation.output.structured', structuredOutput);
		}
	}

	return {
		schemaVersion: 2,
		traceId: spanContext.traceId,
		sessionId: data.sessionId,
		agentName: data.agentName,
	};
}
