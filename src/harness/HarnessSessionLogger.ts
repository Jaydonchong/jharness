import { createWriteStream, WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { finished } from "node:stream/promises";
import logger from "../utils/Logger";
import type {
    AgentSessionEventContext,
    AgentSessionEventType,
} from "./AgentSession";

export class HarnessSessionLogger {
    private readonly queues = new Map<string, Promise<void>>();
    private readonly streams = new Map<string, WriteStream>();
    private readonly streamErrors = new Map<string, Error>();
    private readonly directory: string;
    private isClosed = false;

    constructor(directory = process.env.SESSION_LOG_FS_PATH) {
        if (!directory) {
            throw new Error("SESSION_LOG_FS_PATH is required");
        }
        this.directory = directory;
    }

    public createSession(sessionId: string): void {
        this.enqueue(sessionId, async () => {
            await mkdir(this.directory, { recursive: true });
            const stream = createWriteStream(
                path.join(this.directory, `${sessionId}.txt`),
                { flags: "wx", encoding: "utf8" },
            );
            stream.on("error", (error) => {
                this.streamErrors.set(sessionId, error);
                logger.error("Session log stream failed", { sessionId, error });
            });
            await once(stream, "open");
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
                await once(stream, "drain");
            }
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
                    logger.error("Unable to finish session log stream", { error });
                }
            }),
        );
        this.streams.clear();
    }

    private enqueue(sessionId: string, operation: () => Promise<void>): void {
        if (this.isClosed) {
            logger.warn("Ignoring session log event after logger close", {
                sessionId,
            });
            return;
        }

        const previous = this.queues.get(sessionId) ?? Promise.resolve();
        const next = previous
            .then(operation)
            .catch((error: unknown) => {
                logger.error("Unable to write session log event", {
                    sessionId,
                    error,
                });
            });
        this.queues.set(sessionId, next);
    }
}

function formatEvent(
    eventType: AgentSessionEventType,
    context: AgentSessionEventContext,
): string {
    switch (eventType) {
        case "session_start":
            return "session::start";
        case "session_model":
            return `session::model::${context.provider ?? "unknown"}::${context.model ?? "unknown"}`;
        case "user_message":
            return `user::message::${JSON.stringify(context)}`;
        case "assistant_message":
            return `assistant::message::${JSON.stringify(context.message ?? "")}`;
        case "compaction":
            return "session::compaction";
    }
}
