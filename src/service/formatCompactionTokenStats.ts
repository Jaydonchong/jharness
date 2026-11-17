import type { CompactionTokenStats } from '@compaction/core/Interfaces';

export function formatCompactionTokenStats(stats: CompactionTokenStats): string {
	const change =
		stats.tokensSaved >= 0
			? `${stats.tokensSaved} saved`
			: `${Math.abs(stats.tokensSaved)} added`;
	const percentage =
		stats.reductionPercent === null
			? ''
			: `, ${Math.abs(stats.reductionPercent)}% ${stats.tokensSaved >= 0 ? 'reduction' : 'increase'}`;

	return `-# Conversation compacted: ${stats.beforeTokens} → ${stats.afterTokens} baseline tokens (${change}${percentage}).`;
}
