import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import {
    appendFile,
    mkdir,
    readFile,
    rename,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { DomainError, ErrorCode } from "../../../utils/ErrorCode";
import {
    MEMORY_TYPE,
    MemoryFragment,
    MemoryRetrievalContext,
} from "../../core/Interfaces";
import {
    IMemoryRetrievalStrategy,
    IMemoryWriteStrategy,
} from "../AbstractMemoryStore";

export type DecisionMetadata = {
    created: string;
    version: number;
    tags: string[];
    origin: "system" | "user";
    sessionId: string;
};

export type DecisionRecord = {
    metadata: DecisionMetadata;
    content: string;
};

const DECISION_METADATA_VERSION = 1;
const CHECKPOINT_FILE_NAME = "decision_distillation_checkpoint";
const CHECKPOINT_LINE = "=====DISTILLATION CHECKPOINT=====";

export class LocalFileMemoryDecisionStoreStrategy
    implements IMemoryWriteStrategy, IMemoryRetrievalStrategy
{
    private readonly checkpointFilePath: string;
    private writeQueue: Promise<void> = Promise.resolve();
    private lastRetrievedEndOffset?: number;

    constructor(private readonly decisionFilePath: string) {
        this.checkpointFilePath = join(
            dirname(decisionFilePath),
            CHECKPOINT_FILE_NAME,
        );
        this.initializeFiles();
    }

    private initializeFiles(): void {
        mkdirSync(dirname(this.decisionFilePath), { recursive: true });
        this.createFileIfMissing(this.decisionFilePath, `${CHECKPOINT_LINE}\n`);
        this.createFileIfMissing(this.checkpointFilePath, "0\n");
    }

    private createFileIfMissing(
        filePath: string,
        initialContents: string,
    ): void {
        try {
            writeFileSync(filePath, initialContents, {
                encoding: "utf8",
                flag: "wx",
            });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
        }
    }

    private _buildMetadataFromFragment(
        memory: MemoryFragment,
    ): DecisionMetadata {
        if (
            !memory.additionalContext ||
            !memory.additionalContext["sessionId"] ||
            typeof memory.additionalContext["sessionId"] !== "string"
        ) {
            throw new DomainError(
                ErrorCode.MEMORY_STORAGE_ERROR,
                "Decision stored without session Id",
            );
        }

        return {
            created: memory.created.toISOString(),
            version: DECISION_METADATA_VERSION,
            tags: memory.tags,
            origin: memory.origin,
            sessionId: memory.additionalContext["sessionId"],
        };
    }

    store(memory: MemoryFragment): Promise<void> {
        const record: DecisionRecord = {
            metadata: this._buildMetadataFromFragment(memory),
            content: memory.content,
        };
        const write = this.writeQueue.then(async () => {
            await mkdir(dirname(this.decisionFilePath), { recursive: true });
            await appendFile(
                this.decisionFilePath,
                `<entry>\n---\n${JSON.stringify(record.metadata)}\n---\n${record.content}\n</entry>\n`,
                "utf8",
            );
        });
        this.writeQueue = write.catch(() => undefined);
        return write;
    }

    async retrieve(
        prompt: MemoryRetrievalContext,
    ): Promise<Partial<MemoryFragment[]>> {
        const retrieval = this.writeQueue.then(async () =>
            (await this._retrieve(prompt)).map((record) =>
                this.mapToMemoryFragment(record),
            ),
        );
        this.writeQueue = retrieval.then(
            () => undefined,
            () => undefined,
        );
        return retrieval;
    }

    private mapToMemoryFragment(
        record: DecisionRecord,
    ): MemoryFragment {
        return {
            created: new Date(record.metadata.created),
            type: MEMORY_TYPE.DECISION,
            content: record.content,
            tags: record.metadata.tags,
            origin: record.metadata.origin,
            additionalContext: {
                sessionId: record.metadata.sessionId,
            },
        };
    }

    private async _retrieve(
        _prompt: MemoryRetrievalContext,
    ): Promise<DecisionRecord[]> {
        await mkdir(dirname(this.decisionFilePath), { recursive: true });

        const fileSize = (await stat(this.decisionFilePath)).size;
        const startOffset = await this.readCheckpointOffset(fileSize);

        if (startOffset === fileSize) {
            this.lastRetrievedEndOffset = fileSize;
            return [];
        }

        const input = createReadStream(this.decisionFilePath, {
            start: startOffset,
            encoding: "utf8",
        });
        const lines = createInterface({ input, crlfDelay: Infinity });
        const records: DecisionRecord[] = [];
        let entryLines: string[] | undefined;

        try {
            for await (const line of lines) {
                if (startOffset === 0 && line === CHECKPOINT_LINE) {
                    continue;
                }

                if (line === "<entry>") {
                    if (entryLines) {
                        throw new DomainError(
                            ErrorCode.MEMORY_STORAGE_ERROR,
                            "Nested decision log entry",
                        );
                    }
                    entryLines = [];
                } else if (line === "</entry>") {
                    if (!entryLines) {
                        throw new DomainError(
                            ErrorCode.MEMORY_STORAGE_ERROR,
                            "Decision log entry closed without opening",
                        );
                    }
                    records.push(this.parseEntry(entryLines));
                    entryLines = undefined;
                } else if (entryLines) {
                    entryLines.push(line);
                } else if (line.length > 0) {
                    throw new DomainError(
                        ErrorCode.MEMORY_STORAGE_ERROR,
                        "Unexpected content outside decision log entry",
                    );
                }
            }
        } finally {
            lines.close();
            input.destroy();
        }

        if (entryLines) {
            throw new DomainError(
                ErrorCode.MEMORY_STORAGE_ERROR,
                "Decision log ended before entry was closed",
            );
        }

        this.lastRetrievedEndOffset = startOffset + input.bytesRead;
        return records;
    }

    private parseEntry(lines: string[]): DecisionRecord {
        const metadataStart = lines.indexOf("---");
        const contentStart = lines.indexOf("---", metadataStart + 1);
        if (metadataStart !== 0 || contentStart < 0) {
            throw new DomainError(
                ErrorCode.MEMORY_STORAGE_ERROR,
                "Decision log entry has invalid metadata separators",
            );
        }

        const metadata = JSON.parse(
            lines.slice(metadataStart + 1, contentStart).join("\n"),
        ) as DecisionMetadata;

        return {
            metadata,
            content: lines.slice(contentStart + 1).join("\n"),
        };
    }

    public markDistilled(): Promise<void> {
        const offset = this.lastRetrievedEndOffset;
        if (offset === undefined) {
            return Promise.reject(
                new DomainError(
                    ErrorCode.MEMORY_STORAGE_ERROR,
                    "Cannot advance decision checkpoint before retrieval",
                ),
            );
        }

        const write = this.writeQueue.then(async () => {
            await mkdir(dirname(this.checkpointFilePath), { recursive: true });
            const temporaryPath = `${this.checkpointFilePath}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporaryPath, `${offset}\n`, {
                    encoding: "utf8",
                    flag: "wx",
                });
                await rename(temporaryPath, this.checkpointFilePath);
            } catch (error) {
                await rm(temporaryPath, { force: true });
                throw error;
            }
        });
        this.writeQueue = write.catch(() => undefined);
        return write;
    }

    private async readCheckpointOffset(fileSize: number): Promise<number> {
        let checkpointContents: string;
        try {
            checkpointContents = await readFile(
                this.checkpointFilePath,
                "utf8",
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return 0;
            }
            throw error;
        }

        const offset = Number(checkpointContents.trim());
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > fileSize) {
            throw new DomainError(
                ErrorCode.MEMORY_STORAGE_ERROR,
                "Decision distillation checkpoint is invalid",
            );
        }

        return offset;
    }
}
