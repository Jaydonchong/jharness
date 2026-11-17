import { AbstractAgentConfig } from '@agent/agentConfig/AbstractAgentConfig';
import { ModelConversationMessage } from '@agent/agentConfig/Interfaces';
import { ILlmToolCall } from '@providers/Interfaces';
import { AgentToolExecutionContext } from './AgentTool';
import { getActiveSpan, getMeter } from '@telemetry/Telemetry';
import { TraceScope, WithSpan } from '@telemetry/Decorators';

const DEFAULT_MAX_RETRIES = 3;

export type ToolInvocationContext = AgentToolExecutionContext & {
	sessionId: string;
};

export interface IToolInvocationLogger {
	onToolCall(sessionId: string, toolCall: ILlmToolCall): void;
	onToolResult(sessionId: string, toolCall: ILlmToolCall, output: unknown): void;
}

export type ToolInvokerOptions = {
	maxRetries?: number;
	shouldRetry?: (error: unknown, toolCall: ILlmToolCall) => boolean;
};

@TraceScope('tool-invoker')
export class ToolInvoker {
	private readonly maxRetries: number;
	private readonly meter = getMeter('tool-invoker');
	private readonly toolCallCounter = this.meter.createCounter('tool.call.count', {
		description: 'Number of logical tool call attempts',
		unit: '{call}',
	});
	private readonly toolCallDuration = this.meter.createHistogram('tool.call.duration', {
		description: 'Duration of logical tool calls, including retries',
		unit: 's',
	});

	constructor(
		private readonly agent: AbstractAgentConfig,
		private readonly context: ToolInvocationContext,
		private readonly sessionLogger: IToolInvocationLogger,
		private readonly options: ToolInvokerOptions = {},
	) {
		this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	}

	public async invoke(toolCalls: ILlmToolCall[]): Promise<ModelConversationMessage> {
		const toolCallResults: Record<string, unknown>[] = [];

		for (const toolCall of toolCalls) {
			this.logToolCall(toolCall);
			const result = await this.invokeToolCall(toolCall);

			toolCallResults.push({
				type: 'tool-result',
				toolCallId: toolCall.id,
				toolName: toolCall.name,
				output: {
					type: 'json',
					value: result,
				},
			});
		}

		return {
			role: 'tool',
			content: toolCallResults,
		};
	}

	public logToolCall(toolCall: ILlmToolCall): void {
		this.sessionLogger.onToolCall(this.context.sessionId, toolCall);
	}

	public logToolResult(toolCall: ILlmToolCall, output: unknown): void {
		this.sessionLogger.onToolResult(this.context.sessionId, toolCall, output);
	}

	@WithSpan('tool.invoke')
	private async invokeToolCall(toolCall: ILlmToolCall): Promise<unknown> {
		const span = getActiveSpan();
		span?.setAttribute('tool.name', toolCall.name);
		span?.setAttribute('tool.retry_count', 0);
		const startedAt = performance.now();
		let outcome: 'success' | 'error' = 'success';

		try {
			const tool = this.agent.getTool(toolCall.name);
			let retries = 0;

			while (true) {
				try {
					const output = await tool.useTool(toolCall.input, this.context);
					this.logToolResult(toolCall, output);
					return output;
				} catch (error) {
					if (
						retries >= this.maxRetries ||
						!this.options.shouldRetry?.(error, toolCall)
					) {
						throw error;
					}

					retries++;
					span?.setAttribute('tool.retry_count', retries);
				}
			}
		} catch (error) {
			outcome = 'error';
			throw error;
		} finally {
			const toolName = this.agent.toolRegistry.has(toolCall.name) ? toolCall.name : 'unknown';
			const attributes = { 'tool.name': toolName, 'tool.outcome': outcome };
			this.toolCallCounter.add(1, attributes);
			this.toolCallDuration.record((performance.now() - startedAt) / 1000, attributes);
		}
	}
}
