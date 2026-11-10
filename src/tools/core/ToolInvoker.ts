import { AbstractAgentConfig } from '../../agent/agentConfig/AbstractAgentConfig';
import { ModelConversationMessage } from '../../agent/agentConfig/Interfaces';
import { ILlmToolCall } from '../../providers/Interfaces';
import { AgentToolExecutionContext } from './AgentTool';
import { getTracer } from '../../telemetry/Telemetry';

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

export class ToolInvoker {
	private readonly maxRetries: number;
	private readonly tracer = getTracer('tool-invoker');

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
			const result = await this.tracer.startActiveSpan('tool.invoke', async (span) => {
				span.setAttribute('tool.name', toolCall.name);
				span.setAttribute('tool.retry_count', 0);
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
						span.setAttribute('tool.retry_count', retries);
					}
				}
			});

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
}
