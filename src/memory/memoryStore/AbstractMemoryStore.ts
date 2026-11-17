import {
	MemoryFragment,
	MemoryRetrievalContext,
	PreferenceGroupIndexEntry,
} from '@memory/core/Interfaces';

export abstract class AbstractMemoryStore {
	public abstract store(memory: MemoryFragment): Promise<void>;
	public abstract retrieve(prompt: MemoryRetrievalContext): Promise<Partial<MemoryFragment[]>>;
	public abstract listPreferenceGroups(): Promise<PreferenceGroupIndexEntry[]>;
}

export interface IMemoryWriteStrategy {
	store(memory: MemoryFragment): Promise<void>;
}

export interface IMemoryRetrievalStrategy {
	retrieve(prompt: MemoryRetrievalContext): Promise<Partial<MemoryFragment[]>>;
}
