import { mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { DomainError, ErrorCode } from "../../../utils/ErrorCode";
import {
    MEMORY_TYPE,
    MemoryFragment,
    MemoryRetrievalContext,
    PreferenceGroupIndexEntry,
} from "../../core/Interfaces";
import { AbstractMemoryStore } from "../AbstractMemoryStore";
import { LocalFileMemoryDecisionStoreStrategy } from "./DecisionStorageAndRetrievalStrategy";
import { PreferenceStorageAndRetrievalStrategy } from "./PreferenceStorageAndRetrievalStrategy";
import { SessionSummaryStorageAndRetrievalStrategy } from "./SessionSummaryStorageAndRetrievalStrategy";

type MemoryTypeStrategy =
    | LocalFileMemoryDecisionStoreStrategy
    | PreferenceStorageAndRetrievalStrategy
    | SessionSummaryStorageAndRetrievalStrategy;

export class LocalFileMemoryStore extends AbstractMemoryStore {
    private readonly folderPath: string;
    private readonly decisionStrategy: LocalFileMemoryDecisionStoreStrategy;
    private readonly preferenceStrategy: PreferenceStorageAndRetrievalStrategy;
    private readonly sessionSummaryStrategy: SessionSummaryStorageAndRetrievalStrategy;

    constructor(folderPath = process.env.MEMORY_FOLDER_FS_PATH) {
        super();
        this.folderPath = this.initFolder(folderPath);
        this.decisionStrategy = new LocalFileMemoryDecisionStoreStrategy(
            join(this.folderPath, "decisions", "decision_log.md"),
        );
        this.preferenceStrategy = new PreferenceStorageAndRetrievalStrategy(
            this.folderPath,
        );
        this.sessionSummaryStrategy =
            new SessionSummaryStorageAndRetrievalStrategy(this.folderPath);
    }

    private initFolder(folderPath?: string): string {
        if (!folderPath) {
            throw new DomainError(
                ErrorCode.SERVER_ERROR,
                "MEMORY_FOLDER_FS_PATH is required",
            );
        }

        if (!isAbsolute(folderPath)) {
            throw new DomainError(
                ErrorCode.SERVER_ERROR,
                "MEMORY_FOLDER_FS_PATH must be an absolute filesystem path",
            );
        }

        mkdirSync(folderPath, { recursive: true });
        mkdirSync(join(folderPath, "decisions"), { recursive: true });

        return folderPath;
    }

    public async store(memory: MemoryFragment): Promise<void> {
        await this.withStrategy(memory.type).store(memory);
    }

    public async retrieve(
        retrievalContext: MemoryRetrievalContext,
    ): Promise<Partial<MemoryFragment[]>> {
        const memoryTypes = retrievalContext.filters?.types ?? [
            MEMORY_TYPE.DECISION,
            MEMORY_TYPE.PREFERENCE,
            MEMORY_TYPE.SESSION_SUMMARY,
        ];
        const results = await Promise.all(
            [...new Set(memoryTypes)].map((memoryType) =>
                this.withStrategy(memoryType).retrieve(retrievalContext),
            ),
        );

        return results.flat();
    }

    public async listPreferenceGroups(): Promise<PreferenceGroupIndexEntry[]> {
        return this.preferenceStrategy.listGroups();
    }

    private withStrategy(memoryType: MEMORY_TYPE): MemoryTypeStrategy {
        switch (memoryType) {
            case MEMORY_TYPE.DECISION:
                return this.decisionStrategy;
            case MEMORY_TYPE.PREFERENCE:
                return this.preferenceStrategy;
            case MEMORY_TYPE.SESSION_SUMMARY:
                return this.sessionSummaryStrategy;
            default:
                throw new DomainError(
                    ErrorCode.MEMORY_STORAGE_ERROR,
                    "unsupported memory type",
                );
        }
    }
}
