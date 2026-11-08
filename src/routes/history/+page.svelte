<script lang="ts">
	import { onMount } from 'svelte';
	import { getSessionHistory } from '$lib/db/sessions';
	import { formatDuration } from '$lib/utils/time';
	import type { RoutineSession } from '$lib/db/types';

	interface HistoryEntry extends RoutineSession {
		routineTitle: string;
	}

	interface GroupedHistory {
		date: string;
		dateLabel: string;
		entries: HistoryEntry[];
	}

	let history = $state<GroupedHistory[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			const raw = (await getSessionHistory(60)) as HistoryEntry[];

			// Group by date
			const grouped = new Map<string, HistoryEntry[]>();
			for (const entry of raw) {
				const key = entry.date;
				if (!grouped.has(key)) {
					grouped.set(key, []);
				}
				grouped.get(key)!.push(entry);
			}

			history = Array.from(grouped.entries()).map(([date, entries]) => ({
				date,
				dateLabel: formatDateLabel(date),
				entries
			}));
		} catch (err) {
			console.error('Failed to load history:', err);
		} finally {
			loading = false;
		}
	});

	function formatDateLabel(dateStr: string): string {
		const [year, month, day] = dateStr.split('-').map(Number);
		const date = new Date(year, month - 1, day);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) return 'Today';
		if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
		});
	}

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'completed': return '✅';
			case 'in-progress': return '⏳';
			case 'skipped': return '⏭';
			default: return '○';
		}
	}

	function getStatusText(status: string): string {
		switch (status) {
			case 'completed': return 'Completed';
			case 'in-progress': return 'In Progress';
			case 'skipped': return 'Skipped';
			default: return 'Pending';
		}
	}
</script>

<div class="history-page">
	<h2 class="title-large page-title">Completion History</h2>

	{#if loading}
		<div class="loading-state">
			<p class="body-large">Loading history...</p>
		</div>
	{:else if history.length === 0}
		<div class="empty-state">
			<div class="empty-icon">📊</div>
			<p class="title-medium">No history yet</p>
			<p class="body-medium" style="color: var(--md-sys-color-on-surface-variant)">
				Complete some routines and they'll appear here
			</p>
		</div>
	{:else}
		{#each history as group (group.date)}
			<div class="date-group">
				<h3 class="label-large date-group-header">📅 {group.dateLabel}</h3>
				<div class="entries">
					{#each group.entries as entry (entry.id)}
						<div class="history-entry">
							<span class="entry-icon">{getStatusIcon(entry.status)}</span>
							<div class="entry-info">
								<span class="body-medium entry-title">{entry.routineTitle}</span>
								<span class="label-medium entry-status">{getStatusText(entry.status)}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
	.history-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.page-title {
		color: var(--md-sys-color-on-surface);
	}

	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 48px 16px;
		text-align: center;
	}

	.empty-icon {
		font-size: 3rem;
	}

	.date-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.date-group-header {
		color: var(--md-sys-color-on-surface-variant);
		padding: 4px 0;
	}

	.entries {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.history-entry {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-radius: var(--md-sys-shape-corner-small);
		background-color: var(--md-sys-color-surface-container-low);
	}

	.entry-icon {
		font-size: 1.1rem;
	}

	.entry-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.entry-title {
		color: var(--md-sys-color-on-surface);
	}

	.entry-status {
		color: var(--md-sys-color-on-surface-variant);
	}
</style>
