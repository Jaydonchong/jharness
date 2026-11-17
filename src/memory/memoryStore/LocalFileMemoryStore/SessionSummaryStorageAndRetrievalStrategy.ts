import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { DomainError, ErrorCode } from '@utils/ErrorCode';
import { MEMORY_TYPE, MemoryFragment, MemoryRetrievalContext } from '@memory/core/Interfaces';
import {
	IMemoryRetrievalStrategy,
	IMemoryWriteStrategy,
} from '@memory/memoryStore/AbstractMemoryStore';

type SessionLogMetadata = {
	created: string;
	updated: string;
	summary: string;
};

type SessionLogIndexEntry = {
	fileName: string;
	summary: string;
};

const SESSION_FOLDER_NAME = 'session';
const SESSION_LOGS_FOLDER_NAME = 'sessionLogs';
const SESSION_INDEX_FILE_NAME = 'index.txt';

export class SessionSummaryStorageAndRetrievalStrategy
	implements IMemoryWriteStrategy, IMemoryRetrievalStrategy
{
	private readonly sessionFolderPath: string;
	private readonly sessionLogsFolderPath: string;
	private readonly indexFilePath: string;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(memoryFolderPath: string) {
		this.sessionFolderPath = join(memoryFolderPath, SESSION_FOLDER_NAME);
		this.sessionLogsFolderPath = join(this.sessionFolderPath, SESSION_LOGS_FOLDER_NAME);
		this.indexFilePath = join(this.sessionFolderPath, SESSION_INDEX_FILE_NAME);
		this.initializeFiles();
	}

	private initializeFiles(): void {
		mkdirSync(this.sessionLogsFolderPath, { recursive: true });
		try {
			writeFileSync(this.indexFilePath, '', {
				encoding: 'utf8',
				flag: 'wx',
			});
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error;
			}
		}
	}

	store(memory: MemoryFragment): Promise<void> {
		const sessionId = memory.additionalContext?.sessionId;
		const summary = memory.additionalContext?.summary;
		if (
			typeof sessionId !== 'string' ||
			sessionId.length === 0 ||
			typeof summary !== 'string'
		) {
			throw new DomainError(
				ErrorCode.MEMORY_STORAGE_ERROR,
				'Session summary requires sessionId and summary additional context',
			);
		}

		const write = this.writeQueue.then(() =>
			this.replaceSessionLog(sessionId, summary, memory),
		);
		this.writeQueue = write.catch(() => undefined);
		return write;
	}

	retrieve(_prompt: MemoryRetrievalContext): Promise<Partial<MemoryFragment[]>> {
		const retrieval = this.writeQueue.then(() => this.readSessionSummaries());
		this.writeQueue = retrieval.then(
			() => undefined,
			() => undefined,
		);
		return retrieval;
	}

	private async replaceSessionLog(
		sessionId: string,
		summary: string,
		memory: MemoryFragment,
	): Promise<void> {
		await mkdir(this.sessionLogsFolderPath, { recursive: true });
		const fileName = `${encodeURIComponent(sessionId)}.md`;
		const filePath = join(this.sessionLogsFolderPath, fileName);
		const existingMetadata = await this.readSessionMetadata(filePath);
		const isNewSession = existingMetadata === undefined;
		const now = new Date().toISOString();
		const metadata: SessionLogMetadata = {
			created: existingMetadata?.created ?? memory.created.toISOString(),
			updated: now,
			summary,
		};
		const markdown = `---\n${JSON.stringify(metadata)}\n---\n\n${memory.content}\n`;

		await this.writeAtomically(filePath, markdown);
		if (isNewSession) {
			const indexEntry: SessionLogIndexEntry = { fileName, summary };
			await appendFile(this.indexFilePath, `${JSON.stringify(indexEntry)}\n`, 'utf8');
		}
	}

	private async readSessionSummaries(): Promise<Partial<MemoryFragment[]>> {
		const input = createReadStream(this.indexFilePath, {
			encoding: 'utf8',
		});
		const lines = createInterface({ input, crlfDelay: Infinity });
		const summaries: MemoryFragment[] = [];

		try {
			for await (const line of lines) {
				if (line.length === 0) {
					continue;
				}

				const indexEntry = JSON.parse(line) as SessionLogIndexEntry;
				if (
					basename(indexEntry.fileName) !== indexEntry.fileName ||
					extname(indexEntry.fileName) !== '.md'
				) {
					throw new DomainError(
						ErrorCode.MEMORY_STORAGE_ERROR,
						'Session index contains an invalid log file path',
					);
				}

				const filePath = join(this.sessionLogsFolderPath, indexEntry.fileName);
				const metadata = await this.readSessionMetadata(filePath);
				if (!metadata) {
					throw new DomainError(
						ErrorCode.MEMORY_STORAGE_ERROR,
						'Session index references a missing log file',
					);
				}

				summaries.push({
					created: new Date(metadata.created),
					type: MEMORY_TYPE.SESSION_SUMMARY,
					content: indexEntry.summary,
					origin: 'system',
					tags: [],
				});
			}
		} finally {
			lines.close();
			input.destroy();
		}

		return summaries;
	}

	private async readSessionMetadata(filePath: string): Promise<SessionLogMetadata | undefined> {
		let markdown: string;
		try {
			markdown = await readFile(filePath, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}
			throw error;
		}

		const frontmatterStart = markdown.indexOf('---\n');
		const frontmatterEnd = markdown.indexOf('\n---\n', frontmatterStart + 4);
		if (frontmatterStart !== 0 || frontmatterEnd < 0) {
			throw new DomainError(
				ErrorCode.MEMORY_STORAGE_ERROR,
				'Session log has invalid metadata frontmatter',
			);
		}

		return JSON.parse(
			markdown.slice(frontmatterStart + 4, frontmatterEnd),
		) as SessionLogMetadata;
	}

	private async writeAtomically(filePath: string, contents: string): Promise<void> {
		await mkdir(dirname(filePath), { recursive: true });
		const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporaryPath, contents, {
				encoding: 'utf8',
				flag: 'wx',
			});
			await rename(temporaryPath, filePath);
		} catch (error) {
			await rm(temporaryPath, { force: true });
			throw error;
		}
	}
}
