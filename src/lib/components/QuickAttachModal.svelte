<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getAllRoutines } from '$lib/db/routines';
	import { getTasksForRoutine, addTask, updateTask } from '$lib/db/tasks';
	import { getLatestPendingShare, clearAllPendingShares } from '$lib/db/shares';
	import { parseShareData, type ParsedShare } from '$lib/utils/shareParser';
	import { minutesToSeconds } from '$lib/utils/time';
	import type { Routine, Task } from '$lib/db/types';

	let isOpen = $state(false);
	let shareData = $state<ParsedShare | null>(null);
	let shareFileId = $state<number | null>(null);
	let shareFileName = $state<string | null>(null);

	let routines = $state<Routine[]>([]);
	let selectedRoutineId = $state<number | null>(null);
	let routineTasks = $state<Task[]>([]);
	let selectedTaskId = $state<number | null>(null);
	let attachMode = $state<'new-task' | 'update-task'>('new-task');

	let newTaskTitle = $state('');
	let newTaskDurationMinutes = $state(15);
	let isSubmitting = $state(false);

	onMount(async () => {
		// Check URL parameters first (GET share_target)
		const searchParams = new URLSearchParams(window.location.search);
		const titleParam = searchParams.get('share_title') || searchParams.get('title');
		const textParam = searchParams.get('share_text') || searchParams.get('text');
		const urlParam = searchParams.get('share_url') || searchParams.get('url');

		const parsed = parseShareData(titleParam, textParam, urlParam);
		if (parsed && (parsed.url || parsed.title)) {
			shareData = parsed;
			newTaskTitle = parsed.title || 'Shared Task';
			isOpen = true;
			cleanUrlParams();
		} else {
			// Check IndexedDB for pending file/POST shares
			const pending = await getLatestPendingShare();
			if (pending) {
				shareData = {
					url: pending.url,
					title: pending.title || pending.fileName || 'Shared Item',
					isYouTube: !!pending.url && /(?:youtube\.com|youtu\.be)/i.test(pending.url),
					isPdf: !!pending.fileId || (!!pending.url && /\.pdf(?:$|[?#])/i.test(pending.url))
				};
				shareFileId = pending.fileId ?? null;
				shareFileName = pending.fileName ?? null;
				newTaskTitle = pending.fileName ? pending.fileName.replace(/\.pdf$/i, '') : (pending.title || 'Shared Item');
				isOpen = true;
				await clearAllPendingShares();
			}
		}

		if (isOpen) {
			await loadRoutinesList();
		}
	});

	function cleanUrlParams() {
		const cleanUrl = window.location.pathname;
		window.history.replaceState({}, '', cleanUrl);
	}

	async function loadRoutinesList() {
		routines = await getAllRoutines();
		if (routines.length > 0 && selectedRoutineId === null) {
			selectedRoutineId = routines[0].id!;
			await onRoutineChanged();
		}
	}

	async function onRoutineChanged() {
		if (selectedRoutineId !== null) {
			routineTasks = await getTasksForRoutine(selectedRoutineId);
			if (routineTasks.length > 0) {
				selectedTaskId = routineTasks[0].id!;
			} else {
				selectedTaskId = null;
				attachMode = 'new-task';
			}
		}
	}

	async function handleAttach() {
		if (!shareData || selectedRoutineId === null || isSubmitting) return;
		isSubmitting = true;

		try {
			const linkType = shareFileId ? 'file' : (shareData.url ? 'url' : 'none');
			const linkMeta: Record<string, unknown> = {};

			if (shareFileId) {
				linkMeta.fileId = shareFileId;
				linkMeta.fileName = shareFileName || 'document.pdf';
			}
			if (shareData.ytTimestamp) {
				linkMeta.ytTimestamp = shareData.ytTimestamp;
			}

			if (attachMode === 'new-task') {
				await addTask({
					routineId: selectedRoutineId,
					title: newTaskTitle.trim() || 'Shared Task',
					duration: minutesToSeconds(newTaskDurationMinutes || 15),
					linkType,
					linkUrl: shareFileId ? undefined : shareData.url,
					linkMeta: Object.keys(linkMeta).length > 0 ? linkMeta : undefined
				});
			} else if (attachMode === 'update-task' && selectedTaskId !== null) {
				await updateTask(selectedTaskId, {
					linkType,
					linkUrl: shareFileId ? undefined : shareData.url,
					linkMeta: Object.keys(linkMeta).length > 0 ? linkMeta : undefined
				});
			}

			isOpen = false;
			await goto(`${base}/routines/${selectedRoutineId}`);
		} catch (err) {
			console.error('Failed to attach shared item:', err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleCreateNewRoutine() {
		isOpen = false;
		// Navigate to new routine page
		await goto(`${base}/routines/new`);
	}

	function handleDismiss() {
		isOpen = false;
	}
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) handleDismiss(); }} />

{#if isOpen && shareData}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
	<div class="modal-backdrop" onclick={handleDismiss} role="presentation">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<div
			class="modal-card"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			tabindex="-1"
		>
			<div class="modal-header">
				<div class="header-icon-title">
					<span class="media-icon">
						{#if shareFileId}
							📄
						{:else if shareData.isYouTube}
							📹
						{:else}
							🔗
						{/if}
					</span>
					<div class="header-texts">
						<h3 id="modal-title" class="title-large">Attach Shared {shareFileId ? 'PDF' : shareData.isYouTube ? 'YouTube Link' : 'Link'}</h3>
						<span class="body-medium share-sub">
							{shareFileName || shareData.title || shareData.url}
						</span>
					</div>
				</div>
			</div>

			<div class="modal-body">
				<!-- Shared preview snippet -->
				<div class="shared-preview">
					{#if shareData.url}
						<span class="url-text label-medium">{shareData.url}</span>
					{/if}
					{#if shareFileName}
						<span class="file-text label-medium">📄 {shareFileName}</span>
					{/if}
				</div>

				{#if routines.length > 0}
					<!-- Attach to existing routine -->
					<div class="form-section">
						<label class="field">
							<span class="label-large field-label">Select Routine</span>
							<select
								class="select-input"
								bind:value={selectedRoutineId}
								onchange={onRoutineChanged}
							>
								{#each routines as routine (routine.id)}
									<option value={routine.id}>{routine.title}</option>
								{/each}
							</select>
						</label>

						<div class="mode-selector">
							<button
								class="segment-btn small"
								class:selected={attachMode === 'new-task'}
								onclick={() => attachMode = 'new-task'}
							>
								+ Add as New Task
							</button>
							{#if routineTasks.length > 0}
								<button
									class="segment-btn small"
									class:selected={attachMode === 'update-task'}
									onclick={() => attachMode = 'update-task'}
								>
									Update Existing Task
								</button>
							{/if}
						</div>

						{#if attachMode === 'new-task'}
							<label class="field">
								<span class="body-medium field-hint">Task Title</span>
								<input
									type="text"
									class="text-input"
									bind:value={newTaskTitle}
									placeholder="Task title"
								/>
							</label>

							<label class="field">
								<span class="body-medium field-hint">Duration (minutes)</span>
								<input
									type="number"
									min="1"
									class="text-input small-input"
									bind:value={newTaskDurationMinutes}
								/>
							</label>
						{:else if attachMode === 'update-task' && routineTasks.length > 0}
							<label class="field">
								<span class="body-medium field-hint">Task to Update</span>
								<select class="select-input" bind:value={selectedTaskId}>
									{#each routineTasks as task (task.id)}
										<option value={task.id}>{task.title}</option>
									{/each}
								</select>
							</label>
						{/if}
					</div>
				{:else}
					<p class="body-medium" style="color: var(--md-sys-color-on-surface-variant)">
						You haven't created any routines yet. Create a routine first to attach this.
					</p>
				{/if}
			</div>

			<div class="modal-actions">
				<button class="btn btn-text" onclick={handleDismiss}>Dismiss</button>

				{#if routines.length > 0}
					<button
						class="btn btn-filled"
						disabled={isSubmitting}
						onclick={handleAttach}
					>
						{isSubmitting ? 'Attaching...' : 'Attach to Routine'}
					</button>
				{:else}
					<button class="btn btn-filled" onclick={handleCreateNewRoutine}>
						Create Routine
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		z-index: 100;
	}

	.modal-card {
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		overflow-y: auto;
		background-color: var(--md-sys-color-surface);
		border-radius: var(--md-sys-shape-corner-extra-large);
		box-shadow: var(--md-sys-elevation-2);
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 24px;
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.header-icon-title {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.media-icon {
		font-size: 2rem;
	}

	.header-texts {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.share-sub {
		color: var(--md-sys-color-on-surface-variant);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 320px;
	}

	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.shared-preview {
		padding: 12px;
		border-radius: var(--md-sys-shape-corner-small);
		background-color: var(--md-sys-color-surface-container);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.url-text {
		color: var(--md-sys-color-primary);
		word-break: break-all;
	}

	.file-text {
		color: var(--md-sys-color-on-surface);
	}

	.form-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		color: var(--md-sys-color-on-surface);
	}

	.field-hint {
		color: var(--md-sys-color-on-surface-variant);
	}

	.select-input,
	.text-input {
		padding: 10px 14px;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-small);
		background-color: transparent;
		color: var(--md-sys-color-on-surface);
		font: var(--md-sys-typescale-body-large);
		outline: none;
	}

	.select-input:focus,
	.text-input:focus {
		border-color: var(--md-sys-color-primary);
		border-width: 2px;
		padding: 9px 13px;
	}

	.small-input {
		max-width: 120px;
	}

	.mode-selector {
		display: flex;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-full);
		overflow: hidden;
		margin: 4px 0;
	}

	.segment-btn {
		flex: 1;
		padding: 8px 12px;
		border: none;
		border-right: 1px solid var(--md-sys-color-outline);
		background-color: transparent;
		color: var(--md-sys-color-on-surface);
		font: var(--md-sys-typescale-label-medium);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.segment-btn:last-child {
		border-right: none;
	}

	.segment-btn.selected {
		background-color: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding-top: 8px;
	}

	.btn {
		padding: 10px 20px;
		border-radius: var(--md-sys-shape-corner-full);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		border: none;
		transition: all 0.2s ease;
	}

	.btn-filled {
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}

	.btn-filled:hover {
		box-shadow: var(--md-sys-elevation-1);
	}

	.btn-text {
		background: transparent;
		color: var(--md-sys-color-primary);
	}

	.btn-text:hover {
		background-color: var(--md-sys-color-primary-container);
	}
</style>
