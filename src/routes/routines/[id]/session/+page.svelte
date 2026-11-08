<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { db } from '$lib/db/database';
	import { getRoutine } from '$lib/db/routines';
	import {
		getOrCreateTodaySession,
		initializeTaskProgress,
		syncTaskProgressForSession,
		getTaskProgressForSession,
		updateTaskProgress,
		startSession,
		completeSession
	} from '$lib/db/sessions';
	import {
		loadTask,
		resumeTimer,
		pauseTimer,
		completeTask,
		getTimerState
	} from '$lib/stores/timer.svelte';
	import { openTaskLink, describeLinkType } from '$lib/utils/links';
	import { formatTime, formatDuration } from '$lib/utils/time';
	import { notifyRoutineComplete } from '$lib/utils/notifications';
	import type { Routine, Task, RoutineSession, TaskProgress } from '$lib/db/types';

	interface TaskWithProgress {
		task: Task;
		progress: TaskProgress;
	}

	let routine = $state<Routine | null>(null);
	let session = $state<RoutineSession | null>(null);
	let taskItems = $state<TaskWithProgress[]>([]);
	let activeTaskIndex = $state<number>(-1);
	let loading = $state(true);
	let allCompleted = $state(false);

	const timer = getTimerState();
	const routineId = $derived(Number($page.params.id));

	onMount(async () => {
		await loadSessionData();
	});

	onDestroy(() => {
		// Don't reset — timer continues in background
	});

	async function loadSessionData() {
		try {
			const r = await getRoutine(routineId);
			if (!r) {
				await goto('/');
				return;
			}
			routine = r;

			const s = await getOrCreateTodaySession(routineId);
			session = s;

			// Ensure all routine tasks have progress entries in this session
			await syncTaskProgressForSession(s.id!, routineId);

			// Mark session as in-progress if it was pending
			if (s.status === 'pending') {
				await startSession(s.id!);
				session = { ...s, status: 'in-progress', startedAt: new Date() };
			}

			await refreshTaskList();
		} catch (err) {
			console.error('Failed to load session:', err);
		} finally {
			loading = false;
		}
	}

	async function refreshTaskList() {
		if (!session) return;
		const items = await getTaskProgressForSession(session.id!);
		taskItems = items.map((tp) => ({
			task: tp.task,
			progress: {
				id: tp.id,
				sessionId: tp.sessionId,
				taskId: tp.taskId,
				elapsedSeconds: tp.elapsedSeconds,
				status: tp.status,
				linkState: tp.linkState,
				lastResumedAt: tp.lastResumedAt
			}
		}));

		// Check if all tasks are completed
		allCompleted = taskItems.length > 0 && taskItems.every((t) => t.progress.status === 'completed');

		if (allCompleted && session && session.status !== 'completed') {
			await completeSession(session.id!);
			session = { ...session, status: 'completed', completedAt: new Date() };
			notifyRoutineComplete(routine?.title ?? 'Routine');
		}

		// If no task is selected yet, default to first pending or 0
		if (activeTaskIndex < 0 || activeTaskIndex >= taskItems.length) {
			const firstPending = taskItems.findIndex((t) => t.progress.status !== 'completed');
			activeTaskIndex = firstPending >= 0 ? firstPending : 0;
		}

		// Load active task into timer
		if (taskItems.length > 0 && activeTaskIndex >= 0) {
			const item = taskItems[activeTaskIndex];
			await loadTask(
				item.progress.id!,
				item.task.id!,
				item.task.title,
				item.task.duration,
				item.progress
			);
		}
	}

	async function selectTask(index: number) {
		if (index < 0 || index >= taskItems.length) return;
		if (index === activeTaskIndex) return;

		// Pause current timer if running
		if (timer.status === 'running') {
			await pauseTimer();
		}

		activeTaskIndex = index;
		const item = taskItems[index];
		await loadTask(
			item.progress.id!,
			item.task.id!,
			item.task.title,
			item.task.duration,
			item.progress
		);
	}

	async function handleStartPause() {
		if (timer.status === 'running') {
			await pauseTimer();
		} else {
			await resumeTimer();
		}
	}

	async function handleCompleteTask() {
		await completeTask();
		// Look for next pending task
		const nextPending = taskItems.findIndex(
			(t, i) => i !== activeTaskIndex && t.progress.status !== 'completed'
		);
		if (nextPending >= 0) {
			activeTaskIndex = nextPending;
		}
		await refreshTaskList();
	}

	async function handleRedoTask() {
		if (activeTaskIndex < 0) return;
		const item = taskItems[activeTaskIndex];
		if (!item.progress.id) return;

		await updateTaskProgress(item.progress.id, {
			status: 'pending',
			elapsedSeconds: 0,
			lastResumedAt: undefined
		});

		item.progress.status = 'pending';
		item.progress.elapsedSeconds = 0;
		allCompleted = false;

		await loadTask(
			item.progress.id,
			item.task.id!,
			item.task.title,
			item.task.duration,
			item.progress
		);
	}

	async function goToNextTask() {
		if (taskItems.length <= 1) return;
		const nextIndex = (activeTaskIndex + 1) % taskItems.length;
		await selectTask(nextIndex);
	}

	async function handleOpenLink() {
		if (activeTaskIndex >= 0) {
			const task = taskItems[activeTaskIndex].task;
			await openTaskLink(task);
		}
	}

	let editingBookmark = $state(false);
	let bookmarkValue = $state<number | null>(null);

	function isYouTube(task: Task): boolean {
		return !!task.linkUrl && /(?:youtube\.com|youtu\.be)/.test(task.linkUrl);
	}

	function isPdf(task: Task): boolean {
		if (task.linkType === 'file') return true;
		return !!task.linkUrl && /\.pdf(?:$|[?#])/i.test(task.linkUrl);
	}

	function getCurrentBookmark(task: Task): number | null {
		const meta = task.linkMeta ?? {};
		if (isYouTube(task)) return (meta.ytTimestamp as number) ?? null;
		if (isPdf(task)) return (meta.pdfPage as number) ?? null;
		return null;
	}

	async function saveBookmark() {
		if (activeTaskIndex < 0) return;
		const task = taskItems[activeTaskIndex].task;
		if (!task.id) return;

		const meta = { ...(task.linkMeta ?? {}) };
		if (isYouTube(task)) {
			if (bookmarkValue !== null && bookmarkValue >= 0) {
				meta.ytTimestamp = bookmarkValue;
			} else {
				delete meta.ytTimestamp;
			}
		} else if (isPdf(task)) {
			if (bookmarkValue !== null && bookmarkValue > 0) {
				meta.pdfPage = bookmarkValue;
			} else {
				delete meta.pdfPage;
			}
		}

		await db.tasks.update(task.id, { linkMeta: meta });
		task.linkMeta = meta;
		editingBookmark = false;
	}

	function getProgressPercent(): number {
		if (timer.totalDuration === 0) return 0;
		return (timer.elapsedSeconds / timer.totalDuration) * 100;
	}

	const circumference = 2 * Math.PI * 90; // radius=90
</script>

<div class="session-page">
	<!-- Back header -->
	<div class="session-header">
		<button class="back-btn" onclick={() => goto('/')}>
			← Back
		</button>
		<h2 class="title-large routine-title">{routine?.title ?? 'Loading...'}</h2>
	</div>

	{#if loading}
		<div class="loading-state">
			<p class="body-large">Loading session...</p>
		</div>
	{:else if taskItems.length === 0}
		<div class="empty-state">
			<p class="title-medium">This routine has no tasks yet</p>
			<button class="btn-filled" onclick={() => goto(`/routines/${routineId}`)}>
				Add Tasks
			</button>
		</div>
	{:else}
		<!-- Completion Banner (if finished) -->
		{#if allCompleted}
			<div class="all-done-banner">
				<span class="banner-icon">🎉</span>
				<div class="banner-text">
					<span class="label-large">All tasks finished for today!</span>
					<span class="body-medium" style="color: var(--md-sys-color-on-surface-variant)">
						You can review or re-practice any task below.
					</span>
				</div>
			</div>
		{/if}

		<!-- Top Task Selector (Chips) -->
		<div class="task-selector-wrapper">
			<div class="task-chips-scroll">
				{#each taskItems as item, i (item.task.id)}
					<button
						class="task-chip"
						class:active={i === activeTaskIndex}
						class:chip-completed={item.progress.status === 'completed'}
						class:chip-running={i === activeTaskIndex && timer.status === 'running'}
						onclick={() => selectTask(i)}
					>
						<span class="chip-status-icon">
							{#if item.progress.status === 'completed'}✓{:else}{i + 1}{/if}
						</span>
						<span class="chip-label">{item.task.title}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if activeTaskIndex >= 0}
			<!-- Timer Section -->
			<div class="timer-section">
				<div class="timer-ring">
					<svg viewBox="0 0 200 200" class="timer-svg">
						<!-- Background circle -->
						<circle
							cx="100"
							cy="100"
							r="90"
							fill="none"
							stroke="var(--md-sys-color-surface-container-highest)"
							stroke-width="8"
						/>
						<!-- Progress circle -->
						<circle
							cx="100"
							cy="100"
							r="90"
							fill="none"
							stroke={timer.status === 'completed' ? '#4caf50' : 'var(--md-sys-color-primary)'}
							stroke-width="8"
							stroke-linecap="round"
							stroke-dasharray={circumference}
							stroke-dashoffset={circumference - (circumference * getProgressPercent()) / 100}
							transform="rotate(-90 100 100)"
							class="progress-ring"
						/>
					</svg>
					<div class="timer-text">
						<span class="timer-time">{formatTime(timer.remainingSeconds)}</span>
						<span class="timer-label label-medium">
							{timer.status === 'running' ? 'remaining' :
							 timer.status === 'paused' ? 'paused' :
							 timer.status === 'completed' ? 'done!' : 'ready'}
						</span>
					</div>
				</div>

				<!-- Timer Controls -->
				<div class="timer-controls">
					{#if timer.status !== 'completed'}
						<button
							class="control-btn"
							class:running={timer.status === 'running'}
							onclick={handleStartPause}
						>
							{timer.status === 'running' ? '⏸ Pause' : '▶ Start'}
						</button>
						<button class="control-btn complete-btn" onclick={handleCompleteTask}>
							✓ Complete Task
						</button>
					{:else}
						<button class="control-btn redo-btn" onclick={handleRedoTask}>
							↻ Re-do Task
						</button>
						<button class="control-btn complete-btn" onclick={goToNextTask}>
							⏭ Next Task
						</button>
					{/if}
				</div>
			</div>

			<!-- Current Task Card -->
			<div class="current-task-section">
				<div class="section-title-row">
					<span class="label-medium" style="color: var(--md-sys-color-on-surface-variant)">
						Active Task ({activeTaskIndex + 1} of {taskItems.length})
					</span>
					{#if taskItems[activeTaskIndex].progress.status === 'completed'}
						<span class="task-completed-pill label-medium">Completed ✓</span>
					{/if}
				</div>

				<div class="current-task-card">
					<div class="task-info">
						<h3 class="title-medium">{taskItems[activeTaskIndex].task.title}</h3>
						<span class="body-medium" style="color: var(--md-sys-color-on-primary-container)">
							{formatDuration(taskItems[activeTaskIndex].task.duration)}
						</span>
					</div>

					{#if taskItems[activeTaskIndex].task.linkType !== 'none' && (taskItems[activeTaskIndex].task.linkUrl || taskItems[activeTaskIndex].task.linkType === 'file')}
						<div class="link-actions">
							<button class="link-btn" onclick={handleOpenLink}>
								🔗 Open {describeLinkType(taskItems[activeTaskIndex].task)}
							</button>

							{#if isYouTube(taskItems[activeTaskIndex].task) || isPdf(taskItems[activeTaskIndex].task)}
								<div class="bookmark-row">
									{#if !editingBookmark}
										<span class="bookmark-badge label-medium">
											{#if isYouTube(taskItems[activeTaskIndex].task)}
												{getCurrentBookmark(taskItems[activeTaskIndex].task) !== null ? `⏱ Resume at ${getCurrentBookmark(taskItems[activeTaskIndex].task)}s` : '⏱ Using YouTube history'}
											{:else if isPdf(taskItems[activeTaskIndex].task)}
												{getCurrentBookmark(taskItems[activeTaskIndex].task) !== null ? `📄 Resume at p. ${getCurrentBookmark(taskItems[activeTaskIndex].task)}` : '📄 Resume at p. 1'}
											{/if}
										</span>
										<button class="text-link-btn label-medium" onclick={() => {
											bookmarkValue = getCurrentBookmark(taskItems[activeTaskIndex].task) ?? 1;
											editingBookmark = true;
										}}>
											Update position
										</button>
									{:else}
										<div class="bookmark-edit">
											<input
												type="number"
												min="0"
												class="bookmark-input"
												placeholder={isYouTube(taskItems[activeTaskIndex].task) ? 'seconds' : 'page'}
												bind:value={bookmarkValue}
											/>
											<button class="save-bookmark-btn label-medium" onclick={saveBookmark}>Save</button>
											<button class="cancel-bookmark-btn label-medium" onclick={() => editingBookmark = false}>Cancel</button>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- All Routine Tasks List (Tap to switch anytime) -->
			<div class="task-list-section">
				<span class="label-medium" style="color: var(--md-sys-color-on-surface-variant); padding: 0 4px;">
					All Routine Tasks (tap any to switch)
				</span>
				<div class="task-list-card">
					{#each taskItems as item, i (item.task.id)}
						<button
							class="task-list-item"
							class:active-task={i === activeTaskIndex}
							class:completed-task={item.progress.status === 'completed'}
							class:running-task={i === activeTaskIndex && timer.status === 'running'}
							onclick={() => selectTask(i)}
						>
							<span class="task-status-icon">
								{#if item.progress.status === 'completed'}
									✅
								{:else if i === activeTaskIndex && timer.status === 'running'}
									▶
								{:else if item.progress.status === 'paused'}
									⏸
								{:else}
									{i + 1}.
								{/if}
							</span>
							<div class="task-item-content">
								<span class="task-item-title body-medium">
									{item.task.title}
								</span>
								<span class="task-item-meta label-medium">
									{formatDuration(item.task.duration)}
									{#if item.progress.status === 'completed'}
										· Done
									{:else if item.progress.elapsedSeconds > 0}
										· {formatDuration(item.progress.elapsedSeconds)} done
									{/if}
								</span>
							</div>
							{#if i === activeTaskIndex}
								<span class="active-badge label-medium">Active</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.session-page {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.session-header {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.routine-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.back-btn {
		background: none;
		border: none;
		color: var(--md-sys-color-primary);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		padding: 8px;
		border-radius: var(--md-sys-shape-corner-small);
	}

	.back-btn:hover {
		background-color: var(--md-sys-color-surface-container);
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

	.all-done-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-radius: var(--md-sys-shape-corner-medium);
		background-color: #E8F5E9;
		color: #1B5E20;
		border: 1px solid #A5D6A7;
	}

	.banner-icon {
		font-size: 1.5rem;
	}

	.banner-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* Top Task Chips */
	.task-selector-wrapper {
		width: 100%;
		overflow-x: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}

	.task-selector-wrapper::-webkit-scrollbar {
		display: none;
	}

	.task-chips-scroll {
		display: flex;
		gap: 8px;
		padding: 4px 0;
	}

	.task-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-surface-container);
		color: var(--md-sys-color-on-surface);
		font: var(--md-sys-typescale-label-medium);
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s ease;
	}

	.task-chip.active {
		border-color: var(--md-sys-color-primary);
		background-color: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		font-weight: 600;
	}

	.task-chip.chip-completed {
		border-color: #A5D6A7;
		background-color: #F1F8E9;
		color: #2E7D32;
	}

	.task-chip.chip-running {
		box-shadow: 0 0 0 2px var(--md-sys-color-primary);
	}

	.chip-status-icon {
		font-size: 0.85rem;
	}

	/* Timer */
	.timer-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 8px 0;
	}

	.timer-ring {
		position: relative;
		width: 200px;
		height: 200px;
	}

	.timer-svg {
		width: 100%;
		height: 100%;
	}

	.progress-ring {
		transition: stroke-dashoffset 0.25s ease;
	}

	.timer-text {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.timer-time {
		font-size: 2rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--md-sys-color-on-surface);
	}

	.timer-label {
		color: var(--md-sys-color-on-surface-variant);
	}

	.timer-controls {
		display: flex;
		gap: 12px;
	}

	.control-btn {
		padding: 12px 24px;
		border: 2px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-full);
		background: none;
		color: var(--md-sys-color-primary);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.control-btn:hover {
		background-color: var(--md-sys-color-surface-container);
	}

	.control-btn.running {
		border-color: var(--md-sys-color-primary);
		background-color: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
	}

	.complete-btn {
		border-color: var(--md-sys-color-primary);
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
	}

	.complete-btn:hover {
		box-shadow: var(--md-sys-elevation-1);
	}

	.redo-btn {
		border-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-primary);
	}

	/* Current Task Card */
	.current-task-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 4px;
	}

	.task-completed-pill {
		padding: 2px 8px;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: #E8F5E9;
		color: #2E7D32;
		font-weight: 500;
	}

	.current-task-card {
		padding: 16px;
		border-radius: var(--md-sys-shape-corner-medium);
		background-color: var(--md-sys-color-primary-container);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.task-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.task-info h3 {
		color: var(--md-sys-color-on-primary-container);
	}

	.link-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.link-btn {
		align-self: flex-start;
		padding: 8px 16px;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-full);
		background: var(--md-sys-color-surface);
		color: var(--md-sys-color-primary);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
	}

	.link-btn:hover {
		box-shadow: var(--md-sys-elevation-1);
	}

	.bookmark-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}

	.bookmark-badge {
		padding: 4px 8px;
		background-color: var(--md-sys-color-surface-container);
		border-radius: var(--md-sys-shape-corner-small);
		color: var(--md-sys-color-on-surface);
	}

	.text-link-btn {
		background: none;
		border: none;
		color: var(--md-sys-color-primary);
		cursor: pointer;
		text-decoration: underline;
		padding: 2px 4px;
	}

	.bookmark-edit {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.bookmark-input {
		width: 90px;
		padding: 4px 8px;
		border: 1px solid var(--md-sys-color-outline);
		border-radius: var(--md-sys-shape-corner-small);
		background: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		font: var(--md-sys-typescale-body-medium);
	}

	.save-bookmark-btn {
		padding: 4px 10px;
		border: none;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		cursor: pointer;
	}

	.cancel-bookmark-btn {
		background: none;
		border: none;
		color: var(--md-sys-color-on-surface-variant);
		cursor: pointer;
		padding: 4px;
	}

	/* Task List Section */
	.task-list-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.task-list-card {
		display: flex;
		flex-direction: column;
		background-color: var(--md-sys-color-surface-container-low);
		border-radius: var(--md-sys-shape-corner-medium);
		overflow: hidden;
	}

	.task-list-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border: none;
		border-bottom: 1px solid var(--md-sys-color-surface-container);
		background: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: background-color 0.2s ease;
	}

	.task-list-item:last-child {
		border-bottom: none;
	}

	.task-list-item:hover {
		background-color: var(--md-sys-color-surface-container);
	}

	.task-list-item.active-task {
		background-color: var(--md-sys-color-secondary-container);
	}

	.task-status-icon {
		font-size: 1.1rem;
		min-width: 24px;
	}

	.task-item-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.task-item-title {
		color: var(--md-sys-color-on-surface);
	}

	.task-list-item.completed-task .task-item-title {
		color: var(--md-sys-color-on-surface-variant);
	}

	.task-item-meta {
		color: var(--md-sys-color-on-surface-variant);
	}

	.active-badge {
		padding: 2px 8px;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font-size: 0.75rem;
	}

	.btn-filled {
		margin-top: 12px;
		padding: 12px 24px;
		border: none;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
	}
</style>
