import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AppDataSource } from '@database/data-source';
import { RAGChunkRepository } from '@memory/data/RAGChunkRepository';
import { RAGDocumentRepository } from '@memory/data/RAGDocumentRepository';
import { MEMORY_TYPE, type MemoryFragment } from '@memory/core/Interfaces';
import { PGChunkMemoryStore } from '@memory/memoryStore/PGChunkMemoryStore/PGChunkMemoryStore';
import { CloudflareReranker } from '@network/rerankingModel/CloudflareReranker';
import { DomainError, ErrorCode } from '@utils/ErrorCode';

async function findMarkdownFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const markdownFiles: string[] = [];

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			markdownFiles.push(...(await findMarkdownFiles(entryPath)));
		} else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
			markdownFiles.push(entryPath);
		}
	}

	return markdownFiles.sort();
}

async function indexMarkdownFolder(): Promise<void> {
	const rootPath = process.argv[2];
	if (!rootPath || !path.isAbsolute(rootPath)) {
		throw new DomainError(
			ErrorCode.VALIDATION_ERROR,
			'Usage: npm run rag:index -- <absolute-folder-path>',
		);
	}

	const rootInfo = await lstat(rootPath);
	if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
		throw new DomainError(
			ErrorCode.VALIDATION_ERROR,
			`Path must be an absolute directory, not a symlink: ${rootPath}`,
		);
	}

	const markdownFiles = await findMarkdownFiles(rootPath);
	if (markdownFiles.length === 0) {
		console.log(`No Markdown files found under ${rootPath}`);
		return;
	}

	await AppDataSource.initialize();
	try {
		const memoryStore = new PGChunkMemoryStore(
			new RAGDocumentRepository(),
			new RAGChunkRepository(),
			new CloudflareReranker(),
		);

		for (const [index, filePath] of markdownFiles.entries()) {
			const fragment: MemoryFragment = {
				created: new Date(),
				type: MEMORY_TYPE.FACT,
				content: await readFile(filePath, 'utf8'),
				tags: [],
				origin: 'user',
				additionalContext: {
					title: path.basename(filePath),
					source_references: [filePath],
				},
			};
			await memoryStore.store(fragment);
			console.log(`Indexed ${index + 1}/${markdownFiles.length}: ${filePath}`);
		}

		console.log(`Indexed ${markdownFiles.length} Markdown files from ${rootPath}`);
	} finally {
		await AppDataSource.destroy();
	}
}

indexMarkdownFolder().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
