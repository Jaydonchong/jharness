import { readFileSync } from 'node:fs';
import { ModelConversationMessage } from '@agent/agentConfig/Interfaces';
import { CompactionEngine } from '@compaction/core/CompactionEngine';
import { AbstractMemoryStore } from '@memory/memoryStore/AbstractMemoryStore';
import { PGChunkMemoryStore } from '@memory/memoryStore/PGChunkMemoryStore/PGChunkMemoryStore';
import {
	MEMORY_TYPE,
	MemoryFragment,
	MemoryRetrievalContext,
	PreferenceGroupIndexEntry,
} from './Interfaces';
import { getMeter } from '@telemetry/Telemetry';

type IContextAssemblerDeps = {
	memoryStore: AbstractMemoryStore;
	pgChunkMemoryStore: PGChunkMemoryStore;
	compactionEngine: CompactionEngine;
};

type IAssembledContext = {
	result: string;
};

/**
 * This design loads all preferences for now
 * It is not scalable and in the future it should have proper filters and reranking
 */

export class ContextAssembler {
	private readonly memoryInstructions: string;
	private readonly meter = getMeter('context-assembler');
	private readonly operationCounter = this.meter.createCounter('context.operation.count', {
		description: 'Number of context assembly and recall operations',
		unit: '{operation}',
	});
	private readonly operationDuration = this.meter.createHistogram('context.operation.duration', {
		description: 'Duration of context assembly and recall operations',
		unit: 's',
	});

	constructor(private readonly deps: IContextAssemblerDeps) {
		this.memoryInstructions = readFileSync('src/memory/core/prompts/memory.md', 'utf8');
	}

	public async remember(memory: MemoryFragment): Promise<void> {
		return this.measureOperation('context.remember', async () => {
			const memoryStore =
				memory.type === MEMORY_TYPE.FACT
					? this.deps.pgChunkMemoryStore
					: this.deps.memoryStore;
			await memoryStore.store(memory);
		});
	}

	public async recall(
		retrievalContext: MemoryRetrievalContext,
	): Promise<Partial<MemoryFragment[]>> {
		return this.measureOperation('context.recall', async () => {
			const requestedTypes = retrievalContext.filters?.types;
			const localTypes = requestedTypes
				? requestedTypes.filter((type) => type !== MEMORY_TYPE.FACT)
				: [MEMORY_TYPE.DECISION, MEMORY_TYPE.PREFERENCE, MEMORY_TYPE.SESSION_SUMMARY];
			const retrievals: Array<Promise<Partial<MemoryFragment[]>>> = [];

			if (localTypes.length > 0) {
				retrievals.push(
					this.deps.memoryStore.retrieve({
						...retrievalContext,
						filters: { ...retrievalContext.filters, types: localTypes },
					}),
				);
			}

			if (!requestedTypes || requestedTypes.includes(MEMORY_TYPE.FACT)) {
				retrievals.push(
					this.deps.pgChunkMemoryStore.retrieve({
						...retrievalContext,
						filters: { ...retrievalContext.filters, types: [MEMORY_TYPE.FACT] },
					}),
				);
			}

			return (await Promise.all(retrievals)).flat();
		});
	}

	public async listPreferenceGroups(): Promise<PreferenceGroupIndexEntry[]> {
		return this.deps.memoryStore.listPreferenceGroups();
	}

	public async prepareSessionContext(input: {
		systemPrompt: string;
		userPrompt: string;
	}): Promise<string> {
		return this.measureOperation('context.prepare_session_context', async () => {
			const preferences = await this.recall({
				context: {
					query: input.userPrompt,
					recentContext: input.systemPrompt,
				},
				filters: {
					types: [MEMORY_TYPE.PREFERENCE],
				},
			});

			const preferenceMessages: ModelConversationMessage[] = preferences
				.filter((preference): preference is MemoryFragment => preference !== undefined)
				.map((preference) => ({
					role: preference.origin,
					content: JSON.stringify(preference),
				}));

			if (preferenceMessages.length === 0) {
				return this.memoryInstructions;
			}

			const compactedMemory = await this.deps.compactionEngine.compactMemory({
				systemPrompt: input.systemPrompt,
				messages: preferenceMessages,
				config: {
					factor: 0.3,
				},
			});

			return `${this.memoryInstructions}\n\n<memory>${compactedMemory}</memory>`;
		});
	}

	private async measureOperation<T>(
		operation: 'context.remember' | 'context.recall' | 'context.prepare_session_context',
		callback: () => Promise<T>,
	): Promise<T> {
		const startedAt = performance.now();
		let outcome: 'success' | 'error' = 'success';
		try {
			return await callback();
		} catch (error) {
			outcome = 'error';
			throw error;
		} finally {
			const attributes = { 'context.operation': operation, 'context.outcome': outcome };
			this.operationCounter.add(1, attributes);
			this.operationDuration.record((performance.now() - startedAt) / 1000, attributes);
		}
	}

	private async retrieveDecisionLogs(
		context: MemoryRetrievalContext['context'],
	): Promise<Partial<MemoryFragment[]>> {
		return await this.deps.memoryStore.retrieve({
			context,
			filters: {
				types: [MEMORY_TYPE.DECISION],
			},
		});
	}

	private async retrieveRecentSessionLogs(
		context: MemoryRetrievalContext['context'],
	): Promise<Partial<MemoryFragment[]>> {
		return await this.deps.memoryStore.retrieve({
			context,
			filters: {
				types: [MEMORY_TYPE.SESSION_SUMMARY],
			},
		});
	}
}
