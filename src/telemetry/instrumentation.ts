import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

// Keep the SDK's default attributes, then add this app's identity.
const resource = defaultResource().merge(
	resourceFromAttributes({
		'service.name': process.env.OTEL_SERVICE_NAME ?? 'jharness',
		'service.namespace': process.env.SERVICE_NAMESPACE ?? 'jharness',
		'deployment.environment.name': process.env.ENVIRONMENT_NAME ?? 'local',
		'service.version': process.env.APP_VERSION ?? '1.0.0',
	}),
);

// export const consoleSDK = new NodeSDK({
// 	instrumentations: [getNodeAutoInstrumentations()],
// 	traceExporter: new ConsoleSpanExporter(),
// 	metricReaders: [
// 		new PeriodicExportingMetricReader({
// 			exporter: new ConsoleMetricExporter(),
// 			exportIntervalMillis: 1_000,
// 		}),
// 	],
//     logRecordProcessors: [
//         new BatchLogRecordProcessor({
//             exporter: new ConsoleLogRecordExporter()
//         })
//     ]
// });

export const OTLPsdk = new NodeSDK({
	resource,
	instrumentations: [getNodeAutoInstrumentations()],
	traceExporter: new OTLPTraceExporter(),
	metricReaders: [
		new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter(),
			exportIntervalMillis: 1_000,
		}),
	],
	logRecordProcessors: [
		new BatchLogRecordProcessor({
			exporter: new OTLPLogExporter(),
		}),
	],
});

OTLPsdk.start();
