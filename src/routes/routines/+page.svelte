<script lang="ts">
	import { browser } from '$app/environment';
	import { liveQuery } from 'dexie';
	import { db } from '$lib/db/database';
	import { updateRoutine } from '$lib/db/routines';
	import { describeSchedule } from '$lib/utils/scheduler';
	import type { Routine } from '$lib/db/types';

	let routines = $state<Routine[]>([]);

	if (browser) {
		const query = liveQuery(() => db.routines.orderBy('sortOrder').toArray());
		$effect(() => {
			const subscription = query.subscribe((result) => {
				routines = result;
			});
			return () => subscription.unsubscribe();
		});
	}

	async function toggleActive(routine: Routine) {
		if (routine.id === undefined) return;
		await updateRoutine(routine.id, { isActive: !routine.isActive });
	}
</script>

<div class="page">
	<div class="page-header">
		<h2 class="headline-small">Routines</h2>
	</div>

	{#if routines.length === 0}
		<div class="empty-state">
			<span class="empty-icon">📋</span>
			<p class="body-large">No routines yet</p>
			<p class="body-medium empty-hint">Tap + to create your first routine</p>
		</div>
	{:else}
		<div class="routine-list">
			{#each routines as routine (routine.id)}
				<a href="/routines/{routine.id}" class="routine-card">
					<div class="routine-info">
						<span class="routine-title title-medium">{routine.title}</span>
						<span class="routine-schedule body-medium">{describeSchedule(routine)}</span>
					</div>
					<button
						class="toggle-btn"
						class:active={routine.isActive}
						onclick={(e) => { e.preventDefault(); e.stopPropagation(); toggleActive(routine); }}
						aria-label="Toggle active"
					>
						<span class="toggle-track">
							<span class="toggle-thumb"></span>
						</span>
					</button>
				</a>
			{/each}
		</div>
	{/if}

	<a href="/routines/new" class="fab" aria-label="Create new routine">
		<span class="fab-icon">+</span>
	</a>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		position: relative;
		min-height: calc(100dvh - 64px - 80px);
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 64px 16px;
		color: var(--md-sys-color-on-surface-variant);
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 8px;
	}

	.empty-hint {
		color: var(--md-sys-color-outline);
	}

	.routine-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.routine-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px;
		background-color: var(--md-sys-color-surface-container-low);
		border-radius: var(--md-sys-shape-corner-medium);
		text-decoration: none;
		color: var(--md-sys-color-on-surface);
		transition: background-color 0.2s ease;
	}

	.routine-card:hover {
		background-color: var(--md-sys-color-surface-container);
	}

	.routine-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.routine-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.routine-schedule {
		color: var(--md-sys-color-on-surface-variant);
	}

	/* Toggle switch */
	.toggle-btn {
		flex-shrink: 0;
		background: none;
		border: none;
		padding: 4px;
		cursor: pointer;
	}

	.toggle-track {
		display: flex;
		align-items: center;
		width: 52px;
		height: 32px;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-surface-variant);
		border: 2px solid var(--md-sys-color-outline);
		padding: 2px;
		transition: all 0.2s ease;
	}

	.toggle-btn.active .toggle-track {
		background-color: var(--md-sys-color-primary);
		border-color: var(--md-sys-color-primary);
	}

	.toggle-thumb {
		display: block;
		width: 16px;
		height: 16px;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-outline);
		transition: all 0.2s ease;
	}

	.toggle-btn.active .toggle-thumb {
		transform: translateX(20px);
		width: 24px;
		height: 24px;
		margin: -4px 0;
		background-color: var(--md-sys-color-on-primary);
	}

	/* FAB */
	.fab {
		position: fixed;
		bottom: 80px;
		right: max(16px, calc((100vw - 600px) / 2 + 16px));
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--md-sys-shape-corner-large);
		background-color: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		text-decoration: none;
		box-shadow: var(--md-sys-elevation-2);
		transition: box-shadow 0.2s ease;
		z-index: 5;
	}

	.fab:hover {
		box-shadow: var(--md-sys-elevation-2);
	}

	.fab-icon {
		font-size: 1.5rem;
		font-weight: 500;
		line-height: 1;
	}
</style>
