import {
	context,
	SpanStatusCode,
	trace,
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

	public async *startActiveGenerator<TChunk, TResult>(
		name: string,
		callback: (span: Span) => AsyncGenerator<TChunk, TResult>,
		options?: SpanOptions,
	): AsyncGenerator<TChunk, TResult> {
		const span = this.tracer.startSpan(name, options);
		const activeContext = trace.setSpan(context.active(), span);
		let iterator: AsyncGenerator<TChunk, TResult> | undefined;
		let completed = false;
		let failed = false;

		try {
			const activeIterator = callback(span);
			iterator = activeIterator;
			while (true) {
				const result = await context.with(activeContext, () => activeIterator.next());
				if (result.done) {
					completed = true;
					return result.value;
				}
				yield result.value;
			}
		} catch (error) {
			failed = true;
			span.recordException(error instanceof Error ? error : new Error(String(error)));
			span.setStatus({ code: SpanStatusCode.ERROR });
			throw error;
		} finally {
			try {
				const iteratorToClose = iterator;
				if (iteratorToClose && !completed && !failed) {
					try {
						await context.with(activeContext, () =>
							iteratorToClose.return(undefined as TResult),
						);
					} catch (error) {
						span.recordException(
							error instanceof Error ? error : new Error(String(error)),
						);
						span.setStatus({ code: SpanStatusCode.ERROR });
						throw error;
					}
				}
			} finally {
				span.end();
			}
		}
	}
}
