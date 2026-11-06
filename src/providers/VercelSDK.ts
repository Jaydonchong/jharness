import {
	AISDKError,
	APICallError,
	EmptyResponseBodyError,
	InvalidPromptError,
	InvalidResponseDataError,
	InvalidToolInputError,
	JSONParseError,
	LanguageModel,
	LoadAPIKeyError,
	LoadSettingError,
	ModelMessage,
	NoOutputGeneratedError,
	NoSuchModelError,
	NoSuchProviderReferenceError,
	NoSuchToolError,
	RetryError,
	Tool,
	ToolCallRepairError,
	TypeValidationError,
	UnsupportedFunctionalityError,
	UnsupportedModelVersionError,
	generateText,
	streamText,
	tool,
	Output,
} from 'ai';
import z from 'zod';
import {
	ILlmGenerateTextInput,
	ILlmGenerateTextOutput,
	ILlmProvider,
	ILlmStreamTextInput,
	ILlmStreamTextOutput,
	LlmTextStopReason,
} from './Interfaces';
import { ModelConversationMessage } from '../agent/agentConfig/Interfaces';
import { AgentTool } from '../tools/core/AgentTool';
import { DomainError, ErrorCode } from '../utils/ErrorCode';
import logger from '../utils/Logger';

const mapAiSdkError = (error: unknown): DomainError => {
	const failure = RetryError.isInstance(error) ? (error.lastError ?? error) : error;

	if (failure instanceof DomainError) {
		return failure;
	}

	let code = ErrorCode.SERVER_ERROR;

	if (APICallError.isInstance(failure)) {
		const status = failure.statusCode;
		code =
			status == null || status === 408 || status === 429 || status >= 500
				? ErrorCode.NETWORK_ERROR
				: status === 401 || status === 403
					? ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR
					: ErrorCode.AI_PROVIDER_REQUEST_ERROR;
	} else if (
		InvalidPromptError.isInstance(failure) ||
		LoadAPIKeyError.isInstance(failure) ||
		LoadSettingError.isInstance(failure) ||
		NoSuchModelError.isInstance(failure) ||
		NoSuchProviderReferenceError.isInstance(failure) ||
		UnsupportedFunctionalityError.isInstance(failure) ||
		failure instanceof UnsupportedModelVersionError
	) {
		code = ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR;
	} else if (
		InvalidToolInputError.isInstance(failure) ||
		NoSuchToolError.isInstance(failure) ||
		ToolCallRepairError.isInstance(failure)
	) {
		code = ErrorCode.AI_TOOL_CALL_ERROR;
	} else if (
		InvalidResponseDataError.isInstance(failure) ||
		JSONParseError.isInstance(failure) ||
		TypeValidationError.isInstance(failure)
	) {
		code = ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR;
	} else if (
		EmptyResponseBodyError.isInstance(failure) ||
		NoOutputGeneratedError.isInstance(failure) ||
		AISDKError.isInstance(failure)
	) {
		code = ErrorCode.AI_PROVIDER_RESPONSE_ERROR;
	}

	const message = error instanceof Error ? error.message : 'AI SDK failed';
	return new DomainError(code, message, error);
};

export enum VERCEL_AI_MODELS {
	GPT_6_LUNA = 'openai/gpt-6-luna',
	GPT_6_SOL = 'openai/gpt-6-sol',
	// DS_V4_FLASH = "deepseek/deepseek-v4-flash-0731",
	DS_V4_PRO = 'deepseek-v4-pro',

	// Free model from AI Gateway
	LING_3_1 = 'inclusionai/ling-3.1-flash-free',
	NEMOTRON_LIGHTINING = 'nvidia/nemotron-3.5-lightning-free',
	DEFAULT = 'nvidia/nemotron-3.5-lightning-free',
}

export class VercelSDK implements ILlmProvider<LanguageModel> {
	/**
	 * https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#types
	 */
	public async generateText({
		config,
		messages,
	}: ILlmGenerateTextInput<LanguageModel>): Promise<ILlmGenerateTextOutput> {
		try {
			const result = await generateText({
				model: config.model,
				instructions: config.systemPrompt,
				allowSystemInMessages: false, // Use instructions field instead
				toolChoice: 'auto', // 'auto' | 'none' | 'required'
				maxRetries: 2,
				timeout: 60_000,
				include: {
					// Contorls inclusion of fields in step result, default false for memory
					requestBody: false,
					requestMessages: false,
					responseBody: false,
				},
				onStart: () => {
					logger.info('Firing request using Vercel SDK');
				},
				onEnd: () => {
					logger.info('Request Successful using Vercel SDK');
				},
				onToolExecutionStart: ({ toolCall }) => {
					logger.info('Tool call started', {
						input: toolCall.input,
						name: toolCall.toolName,
					});
				},
				onToolExecutionEnd: ({ toolCall }) => {
					logger.info('Tool call ended', {
						input: toolCall.input,
						name: toolCall.toolName,
					});
				},
				// Tool Registry
				tools: Object.fromEntries(
					config.availableTools.map((t) => [`${t.name}`, this.sanitizeTool(t)]),
				),
				// Disabling temporarily as free models does not supporot response output
				// output: config.outputSchema //
				//     ? Output.object({ schema: config.outputSchema })
				//     : undefined,
				messages: messages as ModelMessage[],
			});
			console.dir(
				{
					finishReason: result.steps[0].finishReason,
					responseMessage: result.responseMessages,
				},
				{ depth: null, colors: true },
			);

			// `result.output` throws when the turn is not a final STOP with
			// parsed output (e.g. a tool-call turn), so only read it then.
			const output =
				config.outputSchema && result.finishReason === LlmTextStopReason.STOP
					? result.output
					: undefined;

			this._verifyEmptyFinalStep(result, output);

			return {
				messages: result.responseMessages as ModelConversationMessage[],
				reply: result.text,
				stopReason: result.finishReason as LlmTextStopReason, //TODO: Map API Enum to APP
				toolCalls: result.toolCalls.map((tool) => {
					return {
						id: tool.toolCallId,
						name: tool.toolName,
						input: tool.input,
					};
				}),
				output,
			};
		} catch (error) {
			logger.error(`generateText Error while calling AI Gateway`, {
				error,
			});
			throw mapAiSdkError(error);
		}
	}

	public async streamText({
		config,
		messages,
	}: ILlmStreamTextInput<LanguageModel>): Promise<ILlmStreamTextOutput> {
		try {
			const result = streamText({
				model: config.model,
				instructions: config.systemPrompt,
				allowSystemInMessages: false, // Use instructions field instead
				toolChoice: 'auto', // 'auto' | 'none' | 'required'
				maxRetries: 2,
				timeout: 60_000,
				include: {
					// Contorls inclusion of fields in step result, default false for memory
					requestBody: false,
					requestMessages: false,
				},
				onStart: () => {
					logger.info('Firing stream request using Vercel SDK');
				},
				onEnd: () => {
					logger.info('stream Request Successful using Vercel SDK');
				},
				tools: Object.fromEntries(
					config.availableTools.map((t) => [`${t.name}`, this.sanitizeTool(t)]),
				),
				output: config.outputSchema
					? Output.object({ schema: config.outputSchema })
					: undefined,
				messages: messages as ModelMessage[],
			});

			return {
				reply: result.textStream,
				completed: Promise.all([
					result.responseMessages,
					result.finishReason,
					result.toolCalls,
				]).then(async ([messages, stopReason, toolCalls]) => {
					let output: unknown;
					if (config.outputSchema && stopReason === LlmTextStopReason.STOP) {
						output = await result.output;
					}
					return {
						messages: messages as ModelConversationMessage[],
						stopReason: stopReason as LlmTextStopReason, //TODO: Map API Enum to APP
						toolCalls: toolCalls.map((tool) => ({
							id: tool.toolCallId,
							name: tool.toolName,
							input: tool.input,
						})),
						output,
					};
				}),
			};
		} catch (error) {
			logger.error(`generateText Error while calling AI Gateway`, {
				error,
			});
			throw mapAiSdkError(error);
		}
	}

	public sanitizeTool<
		TInputSchema extends z.ZodType,
		TOutputSchema extends z.ZodType,
		TContext extends Record<string, unknown> = {},
	>(agentTool: AgentTool<TInputSchema, TOutputSchema>): Tool {
		return tool({
			description: agentTool.description,
			inputSchema: agentTool.inputSchema,
			outputSchema: agentTool.outputSchema,
			// execute: agentTool.useTool.bind(agentTool),
		});
	}

	_verifyEmptyFinalStep(result: Awaited<ReturnType<typeof generateText>>, output: unknown) {
		if (
			result.finishReason === LlmTextStopReason.STOP &&
			output == null &&
			result.text.length === 0 &&
			result.finalStep.content.length > 0
		) {
			logger.warn('Unexpected empty return', {
				finalStepContent: result.finalStep.content,
				resultText: result.text,
				resultContent: result.finalStep.content,
			});
			throw new DomainError(
				ErrorCode.MODEL_RESPONSE_VALIDATION_ERROR,
				'AI SDK returned content without text',
			);
		}
	}
}
