import { ToolInvoker } from '../../tools/core/ToolInvoker';
import { DomainError, ErrorCode } from '../../utils/ErrorCode';
import {
	ILlmGenerateTextInput,
	ILlmGenerateTextOutput,
	ILlmToolCall,
	LlmTextStopReason,
} from '../../providers/Interfaces';
import { AgentConversation } from './AgentConversation';
import type { InterruptionDetails } from '../../harness/core/SessionState';
import { TraceScope, WithSpan } from '../../telemetry/Decorators';

export interface ISessionResult {
	reply: string;
	output?: unknown;
}

export type AgentTurnStrategy<TModelType, TChunk extends string> = {
	runStep(
		input: ILlmGenerateTextInput<TModelType>,
	): AsyncGenerator<TChunk, ILlmGenerateTextOutput>;
};

export type AgentLoopHooks = {
	onProviderCall?: (message: string) => void;
	onToolCall?: (message: string) => void;
	onTurnComplete?: (message: string) => void;
	onTurnInterrupted?: (details: InterruptionDetails, message: string) => void;
	onSessionError?: (message: string) => void;
	onSessionTimeout?: (message: string) => void;
	onAssistantMessage?: (assistantMessage: string, message: string) => void;
	onWarning?: (message: string, context?: object) => void;
	onError?: (message: string) => void;
};

@TraceScope('agent-loop')
export class AgentLoop<TModelType> {
	private static readonly MAX_LOOP_STEP = 10;
	private static readonly MAX_RETRY_PER_STEP = 3;

	constructor(
		private readonly conversation: AgentConversation,
		private readonly toolInvoker: ToolInvoker,
		private readonly getProviderConfig: () => ILlmGenerateTextInput<TModelType>['config'],
		private readonly hooks: AgentLoopHooks = {},
	) {}

	public async *run<TChunk extends string>(
		message: string,
		strategy: AgentTurnStrategy<TModelType, TChunk>,
	): AsyncGenerator<TChunk, ISessionResult> {
		let assistantReply = '';
		try {
			let step = 0;

			while (step < AgentLoop.MAX_LOOP_STEP) {
				let retries = 0;
				let response: ILlmGenerateTextOutput | null = null;

				while (retries < AgentLoop.MAX_RETRY_PER_STEP) {
					this.hooks.onProviderCall?.(message);
					let isStreamedResponse = false;

					try {
						const providerStep = strategy.runStep({
							config: this.getProviderConfig(),
							messages: this.conversation.messages,
						});
						let result = await providerStep.next();
						while (!result.done) {
							isStreamedResponse = true;
							assistantReply += result.value;
							yield result.value;
							result = await providerStep.next();
						}
						response = result.value;

						this.validateResponse(response);
						break;
					} catch (error) {
						retries++;
						this.hooks.onSessionError?.(message);

						if (isStreamedResponse) {
							throw error;
						}
					}
				}

				if (retries >= AgentLoop.MAX_RETRY_PER_STEP || response == null) {
					if (retries >= AgentLoop.MAX_RETRY_PER_STEP) {
						this.hooks.onSessionTimeout?.(message);
					}
					throw new DomainError(
						ErrorCode.AI_PROVIDER_RESPONSE_ERROR,
						'Unable to send request to provider',
					);
				}

				this.conversation.append(response.messages);
				step++;

				switch (response.stopReason) {
					case LlmTextStopReason.STOP:
						if (assistantReply.length === 0) {
							assistantReply = response.reply;
						}
						this.hooks.onAssistantMessage?.(assistantReply, message);
						this.hooks.onTurnComplete?.(message);
						return { reply: assistantReply, output: response.output };
					case LlmTextStopReason.TOOL_CALL:
						const toolCalls = response.toolCalls;
						if (!toolCalls?.length) {
							this.hooks.onSessionError?.(message);
							throw new DomainError(
								ErrorCode.AI_PROVIDER_RESPONSE_ERROR,
								'Tool call stop reason without any tool call',
							);
						}
						this.hooks.onToolCall?.(message);
						const toolResults = await this.invokeToolCallBatch(toolCalls);
						this.conversation.append(toolResults);
						break;
					default:
						this.hooks.onWarning?.('Unhandled response', response);
						throw new DomainError(
							ErrorCode.NOT_IMPLEMENTED,
							`Unhandled agent stop reason: ${response.stopReason}`,
						);
				}
			}

			this.hooks.onError?.('Max iteration reached, stopping loop');
			throw new DomainError(
				ErrorCode.MAX_AGENT_LOOP_ITERATION_REACHED,
				'Agent loop reached its iteration limit',
			);
		} catch (error) {
			this.hooks.onTurnInterrupted?.(
				this.createInterruptionDetails(message, assistantReply, error),
				message,
			);
			throw error;
		} finally {
			this.hooks.onTurnInterrupted?.(
				this.createInterruptionDetails(
					message,
					assistantReply,
					'Stream ended before the assistant turn completed',
				),
				message,
			);
		}
	}

	private validateResponse(response: ILlmGenerateTextOutput): void {
		if (response.stopReason === LlmTextStopReason.ERROR) {
			throw new DomainError(
				ErrorCode.AI_PROVIDER_RESPONSE_ERROR,
				'Provider returned an error response',
			);
		}
		if (response.messages.length === 0 && response.reply.length === 0) {
			throw new DomainError(
				ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
				'Model returned no messages or reply',
			);
		}
	}

	private createInterruptionDetails(
		userMessage: string,
		partialReply: string,
		error: unknown,
	): InterruptionDetails {
		return {
			userMessage,
			partialReply,
			errorMessage: error instanceof Error ? error.message : String(error),
			occurredAt: Date.now(),
		};
	}

	@WithSpan({
		name: 'agent.tool_call_batch',
		attributes: (_instance, args) => ({
			'tool.call_count': (args[0] as ILlmToolCall[]).length,
		}),
	})
	private invokeToolCallBatch(toolCalls: ILlmToolCall[]) {
		return this.toolInvoker.invoke(toolCalls);
	}
}
