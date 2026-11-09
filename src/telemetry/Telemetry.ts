// src/telemetry/Telemetry.ts
import { metrics, trace } from '@opentelemetry/api';
import { Tracer } from './Tracer';

export function getTracer(scope: string) {
	return new Tracer(trace.getTracer(scope));
}

export function getMeter(scope: string) {
	return metrics.getMeter(`${scope}`);
}
