<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { liveQuery } from 'dexie';
	import { db } from '$lib/db/database';
	import { updateRoutine } from '$lib/db/routines';
	import { describeSchedule } from '$lib/utils/scheduler';
	import {
		exportDatabaseToJson,
		downloadOrShareBackup,
		importDatabaseFromJson
	} from '$lib/utils/exportImport';
	import type { Routine } from '$lib/db/types';

	let routines = $state<Routine[]>([]);
	let exporting = $state(false);
	let importing = $state(false);
	let fileInputEl = $state<HTMLInputElement | null>(null);

	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	function showToast(message: string, type: 'success' | 'error' = 'success') {
		toastMessage = message;
		toastType = type;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			toastMessage = null;
		}, 4000);
	}

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

	async function handleExport() {
		if (routines.length === 0) {
			showToast('No routines to export yet', 'error');
			return;
		}
		exporting = true;
		try {
			const json = await exportDatabaseToJson();
			const { method } = await downloadOrShareBackup(json);
			if (method === 'download') {
				showToast('Backup file downloaded');
			} else {
				showToast('Backup shared successfully');
			}
		} catch (err: unknown) {
			console.error('Export error:', err);
			showToast(err instanceof Error ? err.message : 'Export failed', 'error');
		} finally {
			exporting = false;
		}
	}

	async function handleFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importing = true;
		try {
			const text = await file.text();
			const result = await importDatabaseFromJson(text);
			const parts: string[] = [];
			if (result.routinesCount > 0) {
				parts.push(`${result.routinesCount} ${result.routinesCount === 1 ? 'routine' : 'routines'}`);
			}
			if (result.tasksCount > 0) {
				parts.push(`${result.tasksCount} ${result.tasksCount === 1 ? 'task' : 'tasks'}`);
			}
			if (result.filesCount > 0) {
				parts.push(`${result.filesCount} ${result.filesCount === 1 ? 'file' : 'files'}`);
			}
			showToast(`✓ Imported ${parts.join(', ')} successfully!`);
		} catch (err: unknown) {
			console.error('Import error:', err);
			showToast(err instanceof Error ? err.message : 'Import failed', 'error');
		} finally {
			importing = false;
			input.value = '';
		}
	}
</script>

<div class="page">
	<div class="page-header">
		<h2 class="headline-small">Routines</h2>
		<div class="header-actions">
			<button
				class="action-btn"
				onclick={handleExport}
				title="Export routines & backup"
				aria-label="Export routines backup"
				disabled={exporting}
			>
				<span class="btn-icon">📤</span>
				<span class="label-medium btn-text">{exporting ? 'Exporting...' : 'Export'}</span>
			</button>
			<button
				class="action-btn"
				onclick={() => fileInputEl?.click()}
				title="Import routines from backup"
				aria-label="Import routines from backup"
				disabled={importing}
			>
				<span class="btn-icon">📥</span>
				<span class="label-medium btn-text">{importing ? 'Importing...' : 'Import'}</span>
			</button>
			<input
				type="file"
				accept=".json,application/json"
				bind:this={fileInputEl}
				onchange={handleFileSelected}
				style="display: none;"
			/>
		</div>
	</div>

	{#if toastMessage}
		<div class="toast" class:error={toastType === 'error'}>
			<span>{toastMessage}</span>
		</div>
	{/if}

	{#if routines.length === 0}
		<div class="empty-state">
			<span class="empty-icon">📋</span>
			<p class="body-large">No routines yet</p>
			<p class="body-medium empty-hint">Tap + to create your first routine</p>
		</div>
	{:else}
		<div class="routine-list">
			{#each routines as routine (routine.id)}
				<a href="{base}/routines/{routine.id}" class="routine-card">
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

	<a href="{base}/routines/new" class="fab" aria-label="Create new routine">
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
		gap: 12px;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-surface-container-low);
		color: var(--md-sys-color-on-surface);
		cursor: pointer;
		font: var(--md-sys-typescale-label-medium);
		transition: all 0.2s ease;
	}

	.action-btn:hover:not(:disabled) {
		background-color: var(--md-sys-color-surface-container);
		border-color: var(--md-sys-color-primary);
	}

	.action-btn:active:not(:disabled) {
		background-color: var(--md-sys-color-surface-container-high);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-icon {
		font-size: 0.85rem;
		line-height: 1;
	}

	.btn-text {
		color: var(--md-sys-color-on-surface);
	}

	.toast {
		position: fixed;
		bottom: 84px;
		left: 50%;
		transform: translateX(-50%);
		background-color: var(--md-sys-color-inverse-surface, #313033);
		color: var(--md-sys-color-inverse-on-surface, #f4eff4);
		padding: 10px 20px;
		border-radius: var(--md-sys-shape-corner-full);
		box-shadow: var(--md-sys-elevation-2);
		font: var(--md-sys-typescale-body-medium);
		z-index: 1000;
		white-space: nowrap;
		animation: toastFadeIn 0.2s ease-out;
		max-width: calc(100vw - 32px);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.toast.error {
		background-color: var(--md-sys-color-error, #b3261e);
		color: var(--md-sys-color-on-error, #ffffff);
	}

	@keyframes toastFadeIn {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
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
