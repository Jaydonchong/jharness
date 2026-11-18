import type { Attributes } from '@opentelemetry/api';
import { getTracer } from './Telemetry';
import { DomainError, ErrorCode } from '@utils/ErrorCode';

type SpanName = string | ((instance: object, args: unknown[]) => string);

type SpanDecoratorOptions = {
	name: SpanName;
	attributes?: (instance: object, args: unknown[]) => Attributes;
};

const scopeByClass = new WeakMap<Function, string>();

export function TraceScope(scope: string): ClassDecorator {
	return (target) => {
		scopeByClass.set(target, scope);
	};
}

export function WithSpan(nameOrOptions: SpanName | SpanDecoratorOptions): MethodDecorator {
	return createSpanDecorator(undefined, nameOrOptions);
}

export function WithSpanInScope(
	scope: string,
	nameOrOptions: SpanName | SpanDecoratorOptions,
): MethodDecorator {
	return createSpanDecorator(scope, nameOrOptions);
}

function createSpanDecorator(
	scopeOverride: string | undefined,
	nameOrOptions: SpanName | SpanDecoratorOptions,
): MethodDecorator {
	const options = getDecoratorOptions(nameOrOptions);

	return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
		const method = descriptor.value;
		if (typeof method !== 'function') {
			throw new TypeError('Span decorators can only be applied to methods');
		}

		const isAsyncGenerator = method.constructor.name === 'AsyncGeneratorFunction';
		descriptor.value = function (this: object, ...args: unknown[]) {
			const scope = scopeOverride ?? getClassScope(this);
			const tracer = getTracer(scope);
			const spanName =
				typeof options.name === 'function' ? options.name(this, args) : options.name;
			const spanOptions = options.attributes
				? { attributes: options.attributes(this, args) }
				: undefined;

			if (isAsyncGenerator) {
				return tracer.startActiveGenerator(
					spanName,
					() => method.apply(this, args),
					spanOptions,
				);
			}

			return tracer.startActiveSpan(spanName, () => method.apply(this, args), spanOptions);
		};

		return descriptor;
	};
}

function getDecoratorOptions(nameOrOptions: SpanName | SpanDecoratorOptions): SpanDecoratorOptions {
	return typeof nameOrOptions === 'string' || typeof nameOrOptions === 'function'
		? { name: nameOrOptions }
		: nameOrOptions;
}

function getClassScope(instance: object): string {
	let constructor = instance.constructor;
	while (constructor && constructor !== Object) {
		const scope = scopeByClass.get(constructor);
		if (scope) return scope;
		constructor = Object.getPrototypeOf(constructor);
	}

	throw new DomainError(
		ErrorCode.SERVER_ERROR,
		`No TraceScope decorator found for ${instance.constructor.name}`,
	);
}
