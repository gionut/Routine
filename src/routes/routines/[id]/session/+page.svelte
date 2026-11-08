<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { db } from '$lib/db/database';
	import { getRoutine } from '$lib/db/routines';
	import { getTasksForRoutine } from '$lib/db/tasks';
	import {
		getOrCreateTodaySession,
		initializeTaskProgress,
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
		resetTimer,
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

			// Initialize task progress if this is a new session
			const existingProgress = await db.taskProgress
				.where('sessionId')
				.equals(s.id!)
				.count();

			if (existingProgress === 0) {
				await initializeTaskProgress(s.id!, routineId);
			}

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

		// Find the first non-completed task
		const firstPending = taskItems.findIndex(
			(t) => t.progress.status !== 'completed'
		);
		activeTaskIndex = firstPending;

		// Check if all tasks are completed
		allCompleted = taskItems.every((t) => t.progress.status === 'completed');

		if (allCompleted && session && session.status !== 'completed') {
			await completeSession(session.id!);
			session = { ...session, status: 'completed', completedAt: new Date() };
			notifyRoutineComplete(routine?.title ?? 'Routine');
		}

		// Load the active task into the timer
		if (firstPending >= 0) {
			const item = taskItems[firstPending];
			await loadTask(
				item.progress.id!,
				item.task.id!,
				item.task.title,
				item.task.duration,
				item.progress
			);
		}
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
		await refreshTaskList();
	}

	function handleOpenLink() {
		if (activeTaskIndex >= 0) {
			const task = taskItems[activeTaskIndex].task;
			openTaskLink(task);
		}
	}

	let editingBookmark = $state(false);
	let bookmarkValue = $state<number | null>(null);

	function isYouTube(task: Task): boolean {
		return !!task.linkUrl && /(?:youtube\.com|youtu\.be)/.test(task.linkUrl);
	}

	function isPdf(task: Task): boolean {
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

	async function selectTask(index: number) {
		if (taskItems[index].progress.status === 'completed') return;

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

	function getProgressPercent(): number {
		if (timer.totalDuration === 0) return 0;
		return (timer.elapsedSeconds / timer.totalDuration) * 100;
	}

	// Circular timer visual properties
	const circumference = 2 * Math.PI * 90; // radius=90
</script>

<div class="session-page">
	<!-- Back header -->
	<div class="session-header">
		<button class="back-btn" onclick={() => goto('/')}>
			← Back
		</button>
		<h2 class="title-large">{routine?.title ?? 'Loading...'}</h2>
	</div>

	{#if loading}
		<div class="loading-state">
			<p class="body-large">Loading session...</p>
		</div>
	{:else if allCompleted}
		<div class="completed-state">
			<div class="completed-icon">🎉</div>
			<h2 class="headline-small">All Done!</h2>
			<p class="body-large" style="color: var(--md-sys-color-on-surface-variant)">
				You've completed all tasks in this routine.
			</p>
			<button class="btn-filled" onclick={() => goto('/')}>
				Back to Today
			</button>
		</div>
	{:else if activeTaskIndex >= 0}
		<!-- Timer Display -->
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
				{/if}
				<button class="control-btn complete-btn" onclick={handleCompleteTask}>
					{timer.status === 'completed' ? '✓ Next Task' : '⏭ Complete'}
				</button>
			</div>
		</div>

		<!-- Current Task Info -->
		<div class="current-task-section">
			<span class="label-medium" style="color: var(--md-sys-color-on-surface-variant)">Current Task</span>
			<div class="current-task-card">
				<div class="task-info">
					<h3 class="title-medium">{taskItems[activeTaskIndex].task.title}</h3>
					<span class="body-medium" style="color: var(--md-sys-color-on-surface-variant)">
						{formatDuration(taskItems[activeTaskIndex].task.duration)}
					</span>
				</div>
				{#if taskItems[activeTaskIndex].task.linkType !== 'none' && taskItems[activeTaskIndex].task.linkUrl}
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
											{getCurrentBookmark(taskItems[activeTaskIndex].task) !== null ? `📄 Resume at p. ${getCurrentBookmark(taskItems[activeTaskIndex].task)}` : '📄 No page saved'}
										{/if}
									</span>
									<button class="text-link-btn label-medium" onclick={() => {
										bookmarkValue = getCurrentBookmark(taskItems[activeTaskIndex].task);
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

		<!-- Task List -->
		<div class="task-list-section">
			{#each taskItems as item, i (item.task.id)}
				{#if i !== activeTaskIndex}
					<button
						class="task-list-item"
						class:completed-task={item.progress.status === 'completed'}
						class:pending-task={item.progress.status === 'pending' || item.progress.status === 'paused'}
						onclick={() => selectTask(i)}
						disabled={item.progress.status === 'completed'}
					>
						<span class="task-status-icon">
							{item.progress.status === 'completed' ? '✅' : '○'}
						</span>
						<span class="task-item-title body-medium">
							{item.task.title}
						</span>
						<span class="task-item-duration label-medium">
							{formatDuration(item.task.duration)}
						</span>
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.session-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.session-header {
		display: flex;
		align-items: center;
		gap: 12px;
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
	.completed-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 48px 16px;
		text-align: center;
	}

	.completed-icon {
		font-size: 4rem;
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

	/* Timer */
	.timer-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
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
		padding: 12px 28px;
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

	/* Current Task */
	.current-task-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
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

	/* Task List */
	.task-list-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.task-list-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border: none;
		border-radius: var(--md-sys-shape-corner-small);
		background: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: background-color 0.2s ease;
	}

	.task-list-item:hover:not(:disabled) {
		background-color: var(--md-sys-color-surface-container);
	}

	.task-list-item:disabled {
		cursor: default;
	}

	.completed-task .task-item-title {
		text-decoration: line-through;
		color: var(--md-sys-color-on-surface-variant);
	}

	.task-status-icon {
		font-size: 1.1rem;
	}

	.task-item-title {
		flex: 1;
		color: var(--md-sys-color-on-surface);
	}

	.task-item-duration {
		color: var(--md-sys-color-on-surface-variant);
	}
</style>
