<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { getRoutine, updateRoutine, deleteRoutine } from '$lib/db/routines';
	import { getTasksForRoutine, addTask, updateTask, deleteTask } from '$lib/db/tasks';
	import { saveStoredFile } from '$lib/db/files';
	import { minutesToSeconds, secondsToMinutes } from '$lib/utils/time';
	import { PRESET_APPS, buildAppIntentUrl, getPresetAppById } from '$lib/constants/apps';
	import type { Routine, Task } from '$lib/db/types';

	type ScheduleType = Routine['scheduleType'];

	interface TaskForm {
		key: number;
		existingId?: number;
		title: string;
		durationMinutes: number;
		linkType: Task['linkType'];
		linkUrl: string;
		ytTimestamp: number | null;
		pdfPage: number | null;
		fileId: number | null;
		fileName: string | null;
		fileSize: number | null;
		appId?: string;
		selectedFile: File | null;
	}

	let title = $state('');
	let scheduleType = $state<ScheduleType>('daily');
	let scheduleInterval = $state(2);
	let scheduleDays = $state<number[]>([]);
	let tasks = $state<TaskForm[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let nextKey = $state(0);
	let routineId = $state<number>(0);

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const scheduleTypes: { value: ScheduleType; label: string }[] = [
		{ value: 'daily', label: 'Daily' },
		{ value: 'everyN', label: 'Every N Days' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'custom', label: 'Custom' }
	];

	onMount(async () => {
		const id = Number($page.params.id);
		if (isNaN(id)) {
			await goto(`${base}/routines`);
			return;
		}
		routineId = id;

		const routine = await getRoutine(id);
		if (!routine) {
			await goto(`${base}/routines`);
			return;
		}

		title = routine.title;
		scheduleType = routine.scheduleType;
		scheduleInterval = routine.scheduleInterval ?? 2;
		scheduleDays = routine.scheduleDays ?? [];

		const existingTasks = await getTasksForRoutine(id);
		tasks = existingTasks.map((t) => ({
			key: nextKey++,
			existingId: t.id,
			title: t.title,
			durationMinutes: secondsToMinutes(t.duration),
			linkType: t.linkType === 'intent' && t.linkMeta?.appId ? 'app' : t.linkType,
			linkUrl: t.linkUrl ?? '',
			ytTimestamp: (t.linkMeta?.ytTimestamp as number) ?? null,
			pdfPage: (t.linkMeta?.pdfPage as number) ?? null,
			fileId: (t.linkMeta?.fileId as number) ?? null,
			fileName: (t.linkMeta?.fileName as string) ?? null,
			fileSize: (t.linkMeta?.fileSize as number) ?? null,
			appId: (t.linkMeta?.appId as string) ?? (t.linkType === 'app' || t.linkType === 'intent' ? 'kindle' : undefined),
			selectedFile: null
		}));

		loading = false;
	});

	function addNewTask() {
		tasks.push({
			key: nextKey++,
			title: '',
			durationMinutes: 5,
			linkType: 'none',
			linkUrl: '',
			ytTimestamp: null,
			pdfPage: null,
			fileId: null,
			fileName: null,
			fileSize: null,
			appId: 'kindle',
			selectedFile: null
		});
	}

	function handleFileSelected(task: TaskForm, event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			task.selectedFile = file;
			task.fileName = file.name;
			task.fileSize = file.size;
			if (!task.title) {
				task.title = file.name.replace(/\.pdf$/i, '');
			}
		}
	}

	function formatFileSize(bytes: number | null): string {
		if (!bytes) return '';
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function removeTask(index: number) {
		tasks.splice(index, 1);
	}

	function toggleDay(day: number) {
		if (scheduleDays.includes(day)) {
			scheduleDays = scheduleDays.filter((d) => d !== day);
		} else {
			scheduleDays = [...scheduleDays, day].sort();
		}
	}

	function isYouTubeUrl(url: string): boolean {
		return /(?:youtube\.com|youtu\.be)/.test(url);
	}

	function isPdfUrl(url: string): boolean {
		return /\.pdf(?:$|[?#])/i.test(url);
	}

	let canSave = $derived(title.trim().length > 0 && !saving && !loading);

	async function handleSave() {
		if (!canSave) return;
		saving = true;

		try {
			await updateRoutine(routineId, {
				title: title.trim(),
				scheduleType,
				scheduleInterval: scheduleType === 'everyN' || scheduleType === 'custom' ? scheduleInterval : undefined,
				scheduleDays: scheduleType === 'weekly' ? scheduleDays : undefined
			});

			// Get existing task IDs from the DB to diff against
			const existingTasks = await getTasksForRoutine(routineId);
			const existingIds = new Set(existingTasks.map((t) => t.id!));
			const formExistingIds = new Set(tasks.filter((t) => t.existingId).map((t) => t.existingId!));

			// Delete tasks that were removed from the form
			for (const existingId of existingIds) {
				if (!formExistingIds.has(existingId)) {
					await deleteTask(existingId);
				}
			}

			// Update or create tasks
			for (let i = 0; i < tasks.length; i++) {
				const task = tasks[i];
				if (!task.title.trim()) continue;

				let finalLinkUrl: string | undefined = undefined;
				const linkMeta: Record<string, unknown> = {};

				if ((task.linkType === 'url' || task.linkType === 'intent') && task.linkUrl) {
					finalLinkUrl = task.linkUrl;
					if (isYouTubeUrl(task.linkUrl) && task.ytTimestamp !== null && task.ytTimestamp > 0) {
						linkMeta.ytTimestamp = task.ytTimestamp;
					}
					if (isPdfUrl(task.linkUrl) && task.pdfPage !== null && task.pdfPage > 0) {
						linkMeta.pdfPage = task.pdfPage;
					}
				} else if (task.linkType === 'app') {
					const app = getPresetAppById(task.appId || 'kindle') || PRESET_APPS[0];
					linkMeta.appId = app.id;
					linkMeta.appName = app.name;
					linkMeta.appIcon = app.icon;
					linkMeta.packageName = app.packageName;
					finalLinkUrl = buildAppIntentUrl(app);
				} else if (task.linkType === 'file') {
					let fileId = task.fileId;
					if (task.selectedFile) {
						fileId = await saveStoredFile(task.selectedFile, task.selectedFile.name);
					}
					if (fileId) {
						linkMeta.fileId = fileId;
						linkMeta.fileName = task.fileName || 'document.pdf';
						linkMeta.fileSize = task.fileSize || 0;
					}
					if (task.pdfPage !== null && task.pdfPage > 0) {
						linkMeta.pdfPage = task.pdfPage;
					}
				}

				const taskData = {
					title: task.title.trim(),
					duration: minutesToSeconds(task.durationMinutes),
					linkType: task.linkType,
					linkUrl: finalLinkUrl,
					linkMeta: Object.keys(linkMeta).length > 0 ? linkMeta : undefined,
					sortOrder: i
				};

				if (task.existingId) {
					await updateTask(task.existingId, taskData);
				} else {
					await addTask({
						routineId,
						...taskData
					});
				}
			}

			await goto(`${base}/routines`);
		} catch (err) {
			console.error('Failed to update routine:', err);
			saving = false;
		}
	}

	async function handleDelete() {
		if (!confirm('Delete this routine and all its tasks? This cannot be undone.')) return;

		try {
			await deleteRoutine(routineId);
			await goto(`${base}/routines`);
		} catch (err) {
			console.error('Failed to delete routine:', err);
		}
	}
</script>

<div class="page">
	{#if loading}
		<div class="loading">
			<p class="body-large">Loading...</p>
		</div>
	{:else}
		<div class="page-header">
			<h2 class="headline-small">Edit Routine</h2>
		</div>

		<!-- Routine Title -->
		<div class="card">
			<label class="field">
				<span class="label-large field-label">Title</span>
				<input
					type="text"
					class="text-input"
					placeholder="e.g. Morning Workout"
					bind:value={title}
					required
				/>
			</label>
		</div>

		<!-- Schedule -->
		<div class="card">
			<span class="label-large field-label">Schedule</span>

			<div class="segment-group">
				{#each scheduleTypes as st}
					<button
						class="segment-btn"
						class:selected={scheduleType === st.value}
						onclick={() => scheduleType = st.value}
					>
						{st.label}
					</button>
				{/each}
			</div>

			{#if scheduleType === 'everyN' || scheduleType === 'custom'}
				<label class="field">
					<span class="body-medium field-hint">Repeat every N days</span>
					<input
						type="number"
						class="text-input small-input"
						min="1"
						bind:value={scheduleInterval}
					/>
				</label>
			{/if}

			{#if scheduleType === 'weekly'}
				<div class="day-chips">
					{#each dayNames as day, i}
						<button
							class="day-chip"
							class:selected={scheduleDays.includes(i)}
							onclick={() => toggleDay(i)}
						>
							{day}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Tasks -->
		<div class="card">
			<div class="section-header">
				<span class="label-large field-label">Tasks</span>
				<button class="text-btn" onclick={addNewTask}>+ Add Task</button>
			</div>

			{#if tasks.length === 0}
				<p class="body-medium empty-tasks">No tasks yet. Add tasks to build your routine.</p>
			{/if}

			{#each tasks as task, index (task.key)}
				<div class="task-item">
					<div class="task-header">
						<span class="label-medium task-number">Task {index + 1}</span>
						<button class="icon-btn delete-btn" onclick={() => removeTask(index)} aria-label="Delete task">✕</button>
					</div>

					<label class="field">
						<span class="body-medium field-hint">Title</span>
						<input
							type="text"
							class="text-input"
							placeholder="Task title"
							bind:value={task.title}
						/>
					</label>

					<label class="field">
						<span class="body-medium field-hint">Duration (minutes)</span>
						<input
							type="number"
							class="text-input small-input"
							min="1"
							bind:value={task.durationMinutes}
						/>
					</label>

					<div class="field">
						<span class="body-medium field-hint">Link Type</span>
						<div class="link-type-group">
							{#each [['none', 'None'], ['url', 'URL'], ['file', 'PDF File'], ['app', 'App']] as [value, label]}
								<button
									type="button"
									class="segment-btn small"
									class:selected={task.linkType === value}
									onclick={() => {
										task.linkType = value as Task['linkType'];
										if (value === 'app' && !task.appId) {
											task.appId = 'kindle';
											if (!task.title.trim()) task.title = 'Amazon Kindle';
										}
									}}
								>
									{label}
								</button>
							{/each}
						</div>
					</div>

					{#if task.linkType === 'app'}
						<div class="field">
							<span class="body-medium field-hint">Select Android App to Launch</span>
							<div class="app-chips-grid">
								{#each PRESET_APPS as app (app.id)}
									<button
										type="button"
										class="app-chip"
										class:selected={task.appId === app.id}
										onclick={() => {
											task.appId = app.id;
											if (!task.title.trim() || PRESET_APPS.some((p) => p.name === task.title.trim())) {
												task.title = app.name;
											}
										}}
									>
										<span class="app-chip-icon">{app.icon}</span>
										<span class="app-chip-name">{app.name}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if task.linkType === 'file'}
						<div class="field">
							<span class="body-medium field-hint">Offline PDF Document</span>
							<div class="file-picker-container">
								<input
									type="file"
									accept="application/pdf,.pdf"
									id="file-input-edit-{task.key}"
									class="file-input-hidden"
									onchange={(e) => handleFileSelected(task, e)}
								/>
								<label for="file-input-edit-{task.key}" class="file-picker-btn">
									📎 {task.fileName ? 'Change PDF File' : 'Choose PDF File'}
								</label>

								{#if task.fileName}
									<div class="file-info-badge">
										<span class="file-name">📄 {task.fileName}</span>
										{#if task.fileSize}
											<span class="file-size label-medium">({formatFileSize(task.fileSize)})</span>
										{/if}
									</div>
								{/if}
							</div>
						</div>

						<label class="field">
							<span class="body-medium field-hint">Starting PDF Page Number (optional)</span>
							<input
								type="number"
								class="text-input small-input"
								min="1"
								placeholder="1"
								bind:value={task.pdfPage}
							/>
						</label>
					{/if}

					{#if task.linkType === 'url' || task.linkType === 'intent'}
						<label class="field">
							<span class="body-medium field-hint">URL</span>
							<input
								type="url"
								class="text-input"
								placeholder="https://..."
								bind:value={task.linkUrl}
							/>
						</label>

						{#if isYouTubeUrl(task.linkUrl)}
							<label class="field">
								<span class="body-medium field-hint">YouTube Timestamp (seconds, leave empty for YT history)</span>
								<input
									type="number"
									class="text-input small-input"
									min="0"
									placeholder="0"
									bind:value={task.ytTimestamp}
								/>
							</label>
						{/if}

						{#if isPdfUrl(task.linkUrl)}
							<label class="field">
								<span class="body-medium field-hint">PDF Page Number</span>
								<input
									type="number"
									class="text-input small-input"
									min="1"
									placeholder="1"
									bind:value={task.pdfPage}
								/>
							</label>
						{/if}
					{/if}
				</div>
			{/each}
		</div>

		<!-- Actions -->
		<div class="actions">
			<button class="btn btn-danger" onclick={handleDelete}>Delete Routine</button>
			<div class="actions-right">
				<button class="btn btn-text" onclick={() => history.back()}>Cancel</button>
				<button class="btn btn-filled" disabled={!canSave} onclick={handleSave}>
					{saving ? 'Saving...' : 'Save Changes'}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-bottom: 16px;
	}

	.page-header {
		display: flex;
		align-items: center;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 64px 16px;
		color: var(--md-sys-color-on-surface-variant);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px;
		background-color: var(--md-sys-color-surface-container-low);
		border-radius: var(--md-sys-shape-corner-medium);
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

	.text-input {
		padding: 12px 16px;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-small);
		background-color: transparent;
		color: var(--md-sys-color-on-surface);
		font: var(--md-sys-typescale-body-large);
		outline: none;
		transition: border-color 0.2s ease;
	}

	.text-input:focus {
		border-color: var(--md-sys-color-primary);
		border-width: 2px;
		padding: 11px 15px;
	}

	.text-input::placeholder {
		color: var(--md-sys-color-outline);
	}

	.small-input {
		max-width: 120px;
	}

	/* Segmented buttons */
	.segment-group {
		display: flex;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-full);
		overflow: hidden;
	}

	.segment-btn {
		flex: 1;
		padding: 10px 12px;
		border: none;
		border-right: 1px solid var(--md-sys-color-outline);
		background-color: transparent;
		color: var(--md-sys-color-on-surface);
		font: var(--md-sys-typescale-label-large);
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

	.segment-btn.small {
		padding: 8px 12px;
		font: var(--md-sys-typescale-label-medium);
	}

	.link-type-group {
		display: flex;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-full);
		overflow: hidden;
		max-width: 360px;
	}

	.file-picker-container {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: flex-start;
	}

	.file-input-hidden {
		display: none;
	}

	.file-picker-btn {
		display: inline-flex;
		align-items: center;
		padding: 10px 18px;
		border: 1px solid var(--md-sys-color-primary);
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.file-picker-btn:hover {
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}

	.file-info-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-radius: var(--md-sys-shape-corner-small);
		background-color: var(--md-sys-color-surface-container);
	}

	.file-name {
		font: var(--md-sys-typescale-body-medium);
		color: var(--md-sys-color-on-surface);
	}

	.file-size {
		color: var(--md-sys-color-on-surface-variant);
	}

	.app-chips-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}

	.app-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.app-chip:hover {
		background-color: var(--md-sys-color-surface-container);
	}

	.app-chip.selected {
		border-color: var(--md-sys-color-primary);
		background-color: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		font-weight: 600;
	}

	.app-chip-icon {
		font-size: 1.2rem;
	}

	/* Day chips */
	.day-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.day-chip {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--md-sys-shape-corner-full);
		border: 1px solid var(--md-sys-color-outline);
		background-color: transparent;
		color: var(--md-sys-color-on-surface);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.day-chip.selected {
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		border-color: var(--md-sys-color-primary);
	}

	/* Section header */
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.text-btn {
		background: none;
		border: none;
		color: var(--md-sys-color-primary);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		padding: 4px 8px;
		border-radius: var(--md-sys-shape-corner-small);
	}

	.text-btn:hover {
		background-color: var(--md-sys-color-primary-container);
	}

	.empty-tasks {
		color: var(--md-sys-color-outline);
		text-align: center;
		padding: 16px;
	}

	/* Task items */
	.task-item {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px;
		background-color: var(--md-sys-color-surface-container);
		border-radius: var(--md-sys-shape-corner-small);
	}

	.task-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.task-number {
		color: var(--md-sys-color-on-surface-variant);
	}

	.icon-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: var(--md-sys-shape-corner-small);
		color: var(--md-sys-color-on-surface-variant);
		font-size: 1rem;
	}

	.delete-btn:hover {
		background-color: var(--md-sys-color-error-container);
		color: var(--md-sys-color-error);
	}

	/* Action buttons */
	.actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding-top: 8px;
	}

	.actions-right {
		display: flex;
		gap: 12px;
	}

	.btn {
		padding: 12px 24px;
		border-radius: var(--md-sys-shape-corner-full);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		border: none;
		transition: all 0.2s ease;
	}

	.btn:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	.btn-filled {
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}

	.btn-filled:hover:not(:disabled) {
		box-shadow: var(--md-sys-elevation-1);
	}

	.btn-text {
		background: transparent;
		color: var(--md-sys-color-primary);
	}

	.btn-text:hover {
		background-color: var(--md-sys-color-primary-container);
	}

	.btn-danger {
		background: transparent;
		color: var(--md-sys-color-error);
	}

	.btn-danger:hover {
		background-color: var(--md-sys-color-error-container);
	}
</style>
