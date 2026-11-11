// src/telemetry/Telemetry.ts
import { context, metrics, trace } from '@opentelemetry/api';
import { Tracer } from './Tracer';

export function getTracer(scope: string) {
	return new Tracer(trace.getTracer(scope));
}

export function getActiveSpan() {
	return trace.getSpan(context.active());
}

export function getMeter(scope: string) {
	return metrics.getMeter(`${scope}`);
}
