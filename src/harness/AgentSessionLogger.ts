import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import logger from '../utils/Logger';
import type { ILlmToolCall } from '../providers/Interfaces';
import type { IToolInvocationLogger } from '../tools/core/ToolInvoker';
import { AgentSessionEventType } from './AgentSession';
import type { AgentSessionEventContext } from './AgentSession';

export class AgentSessionLogger implements IToolInvocationLogger {
	private readonly queues = new Map<string, Promise<void>>();
	private readonly streams = new Map<string, WriteStream>();
	private readonly streamErrors = new Map<string, Error>();
	private readonly directory: string;
	private readonly directorySetup: Promise<Error | null>;
	private isClosed = false;

	constructor(directory = process.env.SESSION_LOG_FS_PATH) {
		if (!directory) {
			throw new Error('SESSION_LOG_FS_PATH is required');
		}
		this.directory = directory;
		this.directorySetup = mkdir(this.directory, { recursive: true })
			.then(() => null)
			.catch((error: unknown) => {
				const setupError = error instanceof Error ? error : new Error(String(error));
				logger.error('Unable to create session log directory', {
					directory: this.directory,
					error: setupError,
				});
				return setupError;
			});
	}

	public createSession(sessionId: string): void {
		this.enqueue(sessionId, async () => {
			const setupError = await this.directorySetup;
			if (setupError) throw setupError;
			const stream = createWriteStream(path.join(this.directory, `${sessionId}.txt`), {
				flags: 'wx',
				encoding: 'utf8',
			});
			stream.on('error', (error) => {
				this.streamErrors.set(sessionId, error);
				logger.error('Session log stream failed', { sessionId, error });
			});
			await once(stream, 'open');
			this.streams.set(sessionId, stream);
		});
	}

	public onSessionEvent(
		sessionId: string,
		eventType: AgentSessionEventType,
		context: AgentSessionEventContext,
	): void {
		this.enqueue(sessionId, async () => {
			const stream = this.streams.get(sessionId);
			const streamError = this.streamErrors.get(sessionId);
			if (streamError) throw streamError;
			if (!stream) {
				throw new Error(`Session log is not initialized: ${sessionId}`);
			}

			const line = `${Date.now()}::${formatEvent(eventType, context)}\n`;
			if (!stream.write(line)) {
				await once(stream, 'drain');
			}
		});
	}

	public onToolCall(sessionId: string, toolCall: ILlmToolCall): void {
		this.onSessionEvent(sessionId, AgentSessionEventType.TOOL_CALL, {
			toolId: toolCall.id,
			toolName: toolCall.name,
			input: toolCall.input,
		});
	}

	public onToolResult(sessionId: string, toolCall: ILlmToolCall, output: unknown): void {
		this.onSessionEvent(sessionId, AgentSessionEventType.TOOL_RESULT, {
			toolId: toolCall.id,
			toolName: toolCall.name,
			output,
		});
	}

	public async close(): Promise<void> {
		this.isClosed = true;
		await Promise.all(this.queues.values());
		await Promise.all(
			[...this.streams.values()].map(async (stream) => {
				stream.end();
				try {
					await finished(stream);
				} catch (error) {
					logger.error('Unable to finish session log stream', { error });
				}
			}),
		);
		this.streams.clear();
	}

	private enqueue(sessionId: string, operation: () => Promise<void>): void {
		if (this.isClosed) {
			logger.warn('Ignoring session log event after logger close', {
				sessionId,
			});
			return;
		}

		const previous = this.queues.get(sessionId) ?? Promise.resolve();
		const next = previous.then(operation).catch((error: unknown) => {
			logger.error('Unable to write session log event', {
				sessionId,
				error,
			});
		});
		this.queues.set(sessionId, next);
	}
}

function formatEvent(eventType: AgentSessionEventType, context: AgentSessionEventContext): string {
	switch (eventType) {
		case AgentSessionEventType.SESSION_START:
			return 'session::start';
		case AgentSessionEventType.SESSION_MODEL:
			return `session::model::${context.provider ?? 'unknown'}::${context.model ?? 'unknown'}`;
		case AgentSessionEventType.SYSTEM_MESSAGE:
			return `message::system::${stringify(context.message ?? '')}`;
		case AgentSessionEventType.USER_MESSAGE:
			return `message::user::${stringify(context.message ?? '')}`;
		case AgentSessionEventType.ASSISTANT_MESSAGE:
			return `message::assistant::${stringify(context.message ?? '')}`;
		case AgentSessionEventType.COMPACTION:
			return 'session::compaction';
		case AgentSessionEventType.SESSION_ERROR:
			return 'session::error';
		case AgentSessionEventType.SESSION_TIMEOUT:
			return 'session::timeout';
		case AgentSessionEventType.TOOL_CALL:
			return `tools::call::${context.toolId ?? 'unknown'}::${context.toolName ?? 'unknown'}::${stringify(context.input)}`;
		case AgentSessionEventType.TOOL_RESULT:
			return `tools::result::${context.toolId ?? 'unknown'}::${context.toolName ?? 'unknown'}::${stringify(context.output)}`;
	}
}

function stringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}
