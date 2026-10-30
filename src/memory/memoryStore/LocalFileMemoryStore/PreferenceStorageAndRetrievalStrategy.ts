import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import {
    dirname,
    extname,
    isAbsolute,
    join,
    relative,
    resolve,
    sep,
} from "node:path";
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

const PREFERENCES_FOLDER_NAME = "preferences";
const CHUNKS_FOLDER_NAME = "chunks";
const GROUPS_FILE_NAME = "groups.json";

type ChunkReplacement = {
    filePath: string;
    content: string;
};

type GroupReplacement = {
    group: string;
    created: string;
    tags: string[];
    origin: "system" | "user";
    chunks: ChunkReplacement[];
};

export type PreferenceChunk = {
    content: string;
};

export type PreferenceChunkGroup = {
    group: string;
    created: string;
    updated: string;
    tags: string[];
    origin: "system" | "user";
    filePaths: string[];
};

export type PreferenceRetrievalResult = PreferenceChunkGroup[];

export class PreferenceStorageAndRetrievalStrategy
    implements IMemoryWriteStrategy, IMemoryRetrievalStrategy
{
    private readonly preferencesFolderPath: string;
    private readonly chunksFolderPath: string;
    private readonly groupsFilePath: string;
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(memoryFolderPath: string) {
        this.preferencesFolderPath = join(
            memoryFolderPath,
            PREFERENCES_FOLDER_NAME,
        );
        this.chunksFolderPath = join(
            this.preferencesFolderPath,
            CHUNKS_FOLDER_NAME,
        );
        this.groupsFilePath = join(
            this.preferencesFolderPath,
            GROUPS_FILE_NAME,
        );
        this.initializeFiles();
    }

    private initializeFiles(): void {
        mkdirSync(this.chunksFolderPath, { recursive: true });
        try {
            writeFileSync(this.groupsFilePath, "[]\n", {
                encoding: "utf8",
                flag: "wx",
            });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
        }
    }

    store(memory: MemoryFragment): Promise<void> {
        const replacement = this.mapToGroupReplacement(memory);
        const write = this.writeQueue.then(() =>
            this.replaceChunks(replacement),
        );
        this.writeQueue = write.catch(() => undefined);
        return write;
    }

    retrieve(
        _prompt: MemoryRetrievalContext,
    ): Promise<Partial<MemoryFragment[]>> {
        const retrieval = this.writeQueue.then(() => this.readPreferences());
        this.writeQueue = retrieval.then(
            () => undefined,
            () => undefined,
        );
        return retrieval;
    }

    private async replaceChunks(replacement: GroupReplacement): Promise<void> {
        const groups = await this.readGroups();
        const existingGroup = groups.find(
            (group) => group.group === replacement.group,
        );
        const now = new Date().toISOString();
        const normalizedPaths: string[] = [];

        for (const chunk of replacement.chunks) {
            const { absolutePath, relativePath } = this.resolveChunkPath(
                chunk.filePath,
            );
            await mkdir(dirname(absolutePath), { recursive: true });
            await this.writeAtomically(absolutePath, chunk.content);
            normalizedPaths.push(relativePath);
        }

        const replacedPaths = new Set(normalizedPaths);
        const updatedGroups = groups
            .map((group) => ({
                ...group,
                filePaths: group.filePaths.filter(
                    (filePath) => !replacedPaths.has(filePath),
                ),
            }))
            .filter(
                (group) =>
                    group.group === replacement.group ||
                    group.filePaths.length > 0,
            );
        const targetGroup = updatedGroups.find(
            (group) => group.group === replacement.group,
        );
        const updatedTargetGroup: PreferenceChunkGroup = {
            group: replacement.group,
            created: existingGroup?.created ?? replacement.created,
            updated: now,
            tags: replacement.tags,
            origin: replacement.origin,
            filePaths: [
                ...new Set([
                    ...(targetGroup?.filePaths ?? []),
                    ...normalizedPaths,
                ]),
            ],
        };

        const nextGroups = updatedGroups.filter(
            (group) => group.group !== replacement.group,
        );
        nextGroups.push(updatedTargetGroup);
        await this.writeAtomically(
            this.groupsFilePath,
            `${JSON.stringify(nextGroups, null, 2)}\n`,
        );
    }

    private mapToGroupReplacement(memory: MemoryFragment): GroupReplacement {
        const additionalContext = memory.additionalContext;
        const group = additionalContext?.group;
        const filePath = additionalContext?.filePath;
        if (
            typeof group !== "string" ||
            group.length === 0 ||
            typeof filePath !== "string" ||
            filePath.length === 0
        ) {
            throw new DomainError(
                ErrorCode.MEMORY_STORAGE_ERROR,
                "Preference memory requires group and filePath additional context",
            );
        }

        return {
            group,
            created: memory.created.toISOString(),
            tags: memory.tags,
            origin: memory.origin,
            chunks: [{ filePath, content: memory.content }],
        };
    }

    private async readPreferences(): Promise<Partial<MemoryFragment[]>> {
        const groups = await this.readGroups();
        const preferences: MemoryFragment[] = [];

        for (const group of groups) {
            for (const filePath of group.filePaths) {
                const chunkPath = this.resolveChunkPath(filePath);
                const content = await readFile(chunkPath.absolutePath, "utf8");
                preferences.push({
                    created: new Date(group.created),
                    type: MEMORY_TYPE.PREFERENCE,
                    content,
                    tags: group.tags,
                    origin: group.origin ?? "system",
                    additionalContext: {
                        group: group.group,
                        filePath: chunkPath.relativePath,
                        updated: group.updated,
                    },
                });
            }
        }

        return preferences;
    }

    private async readGroups(): Promise<PreferenceRetrievalResult> {
        const serializedGroups = await readFile(this.groupsFilePath, "utf8");
        return JSON.parse(serializedGroups) as PreferenceRetrievalResult;
    }

    private resolveChunkPath(filePath: string): {
        absolutePath: string;
        relativePath: string;
    } {
        if (isAbsolute(filePath) || extname(filePath) !== ".md") {
            throw new DomainError(
                ErrorCode.MEMORY_STORAGE_ERROR,
                "Preference chunk file paths must be relative Markdown paths",
            );
        }

        const absolutePath = resolve(this.chunksFolderPath, filePath);
        const relativePath = relative(this.chunksFolderPath, absolutePath);
        if (
            relativePath === "" ||
            relativePath === ".." ||
            relativePath.startsWith(`..${sep}`) ||
            isAbsolute(relativePath)
        ) {
            throw new DomainError(
                ErrorCode.MEMORY_STORAGE_ERROR,
                "Preference chunk file path must stay inside the chunks folder",
            );
        }

        return {
            absolutePath,
            relativePath: relativePath.split(sep).join("/"),
        };
    }

    private async writeAtomically(
        filePath: string,
        contents: string,
    ): Promise<void> {
        await mkdir(dirname(filePath), { recursive: true });
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporaryPath, contents, {
                encoding: "utf8",
                flag: "wx",
            });
            await rename(temporaryPath, filePath);
        } catch (error) {
            await rm(temporaryPath, { force: true });
            throw error;
        }
    }
}
