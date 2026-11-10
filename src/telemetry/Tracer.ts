import {
	SpanStatusCode,
	type Span,
	type SpanOptions,
	type Tracer as OtelTracer,
} from '@opentelemetry/api';

export class Tracer {
	constructor(private readonly tracer: OtelTracer) {}

	public startActiveSpan<T>(
		name: string,
		callback: (span: Span) => T | Promise<T>,
		options?: SpanOptions,
	): Promise<T> {
		return this.tracer.startActiveSpan(name, options ?? {}, async (span) => {
			try {
				return await callback(span);
			} catch (error) {
				span.recordException(error instanceof Error ? error : new Error(String(error)));
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw error;
			} finally {
				span.end();
			}
		});
	}
}
