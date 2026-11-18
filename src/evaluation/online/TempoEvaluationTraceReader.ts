import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
	EvaluationTraceReader,
	OnlineEvaluationMessage,
	OnlineEvaluationTraceData,
} from './Contracts';

type OtlpStringValue = { stringValue?: string };

type TempoSpan = {
	name?: string;
	attributes?: { key: string; value?: OtlpStringValue }[];
};

type TempoTraceResponse = {
	trace?: {
		resourceSpans?: {
			scopeSpans?: {
				spans?: TempoSpan[];
			}[];
		}[];
	};
};

const READ_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000];

export class TempoEvaluationTraceReader implements EvaluationTraceReader {
	private readonly http: AxiosInstance;

	public constructor(baseUrl = 'http://tempo:3200') {
		this.http = axios.create({ baseURL: baseUrl, timeout: 5_000 });
	}

	public async read(message: OnlineEvaluationMessage): Promise<OnlineEvaluationTraceData> {
		let lastError: unknown;
		for (let attempt = 0; attempt <= READ_RETRY_DELAYS_MS.length; attempt++) {
			try {
				const response = await this.http.get<TempoTraceResponse>(
					`/api/v2/traces/${encodeURIComponent(message.traceId)}`,
				);
				const traceData = extractEvaluationData(response.data, message.sessionId);
				if (traceData) return traceData;
			} catch (error) {
				if (axios.isAxiosError(error) && error.response && error.response.status !== 404) {
					throw error;
				}
				lastError = error;
			}

			const delayMs = READ_RETRY_DELAYS_MS[attempt];
			if (delayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, delayMs));
		}

		const failure = lastError instanceof Error ? `: ${lastError.message}` : '';
		throw new Error(
			`Tempo trace ${message.traceId} does not contain evaluation data for session ${message.sessionId}${failure}`,
		);
	}
}

function extractEvaluationData(
	response: TempoTraceResponse,
	sessionId: string,
): OnlineEvaluationTraceData | undefined {
	const spans =
		response.trace?.resourceSpans?.flatMap((resourceSpan) =>
			(resourceSpan.scopeSpans ?? []).flatMap((scopeSpan) => scopeSpan.spans ?? []),
		) ?? [];
	const requestSpan = spans.find(
		(span) =>
			span.name === 'request.incoming' &&
			getStringAttribute(span, 'evaluation.session.id') === sessionId,
	);
	if (!requestSpan) return undefined;

	const input = getStringAttribute(requestSpan, 'evaluation.input');
	const text = getStringAttribute(requestSpan, 'evaluation.output.text');
	const completedAt = getStringAttribute(requestSpan, 'evaluation.completed_at');
	if (input === undefined || text === undefined || completedAt === undefined) return undefined;

	const toolCalls = spans
		.filter((span) => span.name === 'tool.invoke')
		.map((span) => getStringAttribute(span, 'tool.name'))
		.filter((toolName): toolName is string => toolName !== undefined);

	return {
		input,
		output: {
			text,
			structuredOutput: parseJsonAttribute(
				getStringAttribute(requestSpan, 'evaluation.output.structured'),
			),
			metadata: { toolCalls },
		},
		completedAt,
	};
}

function getStringAttribute(span: TempoSpan, key: string): string | undefined {
	return span.attributes?.find((attribute) => attribute.key === key)?.value?.stringValue;
}

function parseJsonAttribute(value: string | undefined): unknown {
	if (value === undefined) return undefined;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}
