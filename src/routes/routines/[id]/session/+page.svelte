<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { db } from '$lib/db/database';
	import { getRoutine } from '$lib/db/routines';
	import {
		getOrCreateTodaySession,
		initializeTaskProgress,
		syncTaskProgressForSession,
		getTaskProgressForSession,
		updateTaskProgress,
		setActiveTaskForSession,
		startSession,
		completeSession
	} from '$lib/db/sessions';
	import {
		loadTask,
		resumeTimer,
		pauseTimer,
		completeTask,
		addExtraTime,
		clearJustFinished,
		getTimerState
	} from '$lib/stores/timer.svelte';
	import { stopAlarm } from '$lib/utils/audioAlarm';
	import { updateTask } from '$lib/db/tasks';
	import { openTaskLink, describeLinkType } from '$lib/utils/links';
	import { formatTime, formatDuration } from '$lib/utils/time';
	import { notifyRoutineComplete, dismissTaskNotification } from '$lib/utils/notifications';
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

	// Task Completion & Extra Time Modal state
	let showCompletionModal = $state(false);
	let templateDurationMinutes = $state(5);
	let updateFutureTemplate = $state(false);

	const timer = getTimerState();
	const routineId = $derived(Number($page.params.id));

	// Trigger completion modal ONLY when active countdown naturally finishes
	$effect(() => {
		if (timer.justFinished && activeTaskIndex >= 0) {
			clearJustFinished();
			const currentItem = taskItems[activeTaskIndex];
			if (currentItem) {
				templateDurationMinutes = Math.max(1, Math.round(timer.totalDuration / 60));
				updateFutureTemplate = false;
				showCompletionModal = true;
			}
		}
	});

	const handleSWMessage = async (event: MessageEvent) => {
		if (!event.data) return;
		if (event.data.type === 'NOTIFICATION_ADD_EXTRA_MINUTES') {
			const minutes = Number(event.data.minutes) || 2;
			await handleAddExtraMinutes(minutes);
		} else if (event.data.type === 'NOTIFICATION_TASK_DONE') {
			handleCompleteTaskClick();
		}
	};

	onMount(async () => {
		await loadSessionData();

		if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
			navigator.serviceWorker.addEventListener('message', handleSWMessage);
		}
	});

	onDestroy(() => {
		stopAlarm();
		if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
			navigator.serviceWorker.removeEventListener('message', handleSWMessage);
		}
		// Don't reset timer — timer continues in background
	});

	function formatCompletedTime(date?: Date | string): string {
		if (!date) return '';
		const d = new Date(date);
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	async function loadSessionData() {
		try {
			const r = await getRoutine(routineId);
			if (!r) {
				await goto(`${base}/`);
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

			// Ensure session has an activeTaskId persisted
			if (session && !session.activeTaskId && taskItems.length > 0 && activeTaskIndex >= 0) {
				const activeId = taskItems[activeTaskIndex].task.id!;
				await setActiveTaskForSession(session.id!, activeId);
				session.activeTaskId = activeId;
			}
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
				lastResumedAt: tp.lastResumedAt,
				completedAt: tp.completedAt
			}
		}));

		// Check if all tasks are completed
		allCompleted = taskItems.length > 0 && taskItems.every((t) => t.progress.status === 'completed');

		if (allCompleted && session && session.status !== 'completed') {
			await completeSession(session.id!);
			session = { ...session, status: 'completed', completedAt: new Date() };
			notifyRoutineComplete(routine?.title ?? 'Routine');
		}

		// If no task is selected yet, restore from session.activeTaskId if present, else first pending or 0
		if (activeTaskIndex < 0 || activeTaskIndex >= taskItems.length) {
			let targetIndex = -1;
			const savedActiveTaskId = session?.activeTaskId;
			if (savedActiveTaskId) {
				targetIndex = taskItems.findIndex((t) => t.task.id === savedActiveTaskId);
			}
			if (targetIndex < 0) {
				targetIndex = taskItems.findIndex((t) => t.progress.status !== 'completed');
			}
			activeTaskIndex = targetIndex >= 0 ? targetIndex : 0;
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

		stopAlarm();
		// Pause current timer if running
		if (timer.status === 'running') {
			await pauseTimer();
		}

		activeTaskIndex = index;
		const item = taskItems[index];

		// Persist the active task so navigating away and returning restores this task
		if (session?.id && item?.task?.id) {
			await setActiveTaskForSession(session.id, item.task.id);
			session.activeTaskId = item.task.id;
		}

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

	function handleCompleteTaskClick() {
		stopAlarm();
		if (activeTaskIndex >= 0 && taskItems[activeTaskIndex]) {
			templateDurationMinutes = Math.max(1, Math.round(timer.totalDuration / 60));
			updateFutureTemplate = false;
			showCompletionModal = true;
		}
	}

	async function handleAddExtraMinutes(minutes: number) {
		stopAlarm();
		showCompletionModal = false;
		await addExtraTime(minutes * 60);
		if (activeTaskIndex >= 0 && taskItems[activeTaskIndex]) {
			taskItems[activeTaskIndex].progress.status = 'running';
			taskItems[activeTaskIndex].task.duration = timer.totalDuration;
		}
	}

	async function confirmCompleteTask() {
		stopAlarm();
		await dismissTaskNotification();
		showCompletionModal = false;
		if (activeTaskIndex >= 0 && taskItems[activeTaskIndex]) {
			const currentItem = taskItems[activeTaskIndex];
			if (updateFutureTemplate && currentItem.task.id) {
				const newDurationSeconds = templateDurationMinutes * 60;
				await updateTask(currentItem.task.id, { duration: newDurationSeconds });
				currentItem.task.duration = newDurationSeconds;
			}
		}

		await completeTask();
		clearJustFinished();
		await refreshTaskList();

		// Look for next pending task
		const nextPending = taskItems.findIndex(
			(t, i) => i !== activeTaskIndex && t.progress.status !== 'completed'
		);
		if (nextPending >= 0) {
			await selectTask(nextPending);
		}
	}

	async function handleCompleteTask() {
		handleCompleteTaskClick();
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
			if (timer.status === 'idle' || timer.status === 'paused') {
				await resumeTimer();
				if (taskItems[activeTaskIndex]) {
					taskItems[activeTaskIndex].progress.status = 'running';
				}
			}
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
		<button class="back-btn" onclick={() => goto(`${base}/`)}>
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
			<button class="btn-filled" onclick={() => goto(`${base}/routines/${routineId}`)}>
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
						<span class="chip-label">
							{item.task.title}
							{#if item.progress.status === 'completed' && item.progress.completedAt}
								<span class="chip-completed-time">· {formatCompletedTime(item.progress.completedAt)}</span>
							{/if}
						</span>
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

					{#if taskItems[activeTaskIndex].task.linkType !== 'none' && (taskItems[activeTaskIndex].task.linkUrl || taskItems[activeTaskIndex].task.linkType === 'file' || taskItems[activeTaskIndex].task.linkType === 'app')}
						<div class="link-actions">
							<button class="link-btn" onclick={handleOpenLink}>
								{#if taskItems[activeTaskIndex].task.linkType === 'app'}
									{taskItems[activeTaskIndex].task.linkMeta?.appIcon ?? '📱'} Open {taskItems[activeTaskIndex].task.linkMeta?.appName ?? 'App'}
								{:else}
									🔗 Open {describeLinkType(taskItems[activeTaskIndex].task)}
								{/if}
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
										· Done {#if item.progress.completedAt}({formatCompletedTime(item.progress.completedAt)}){/if}
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

	{#if showCompletionModal && activeTaskIndex >= 0 && taskItems[activeTaskIndex]}
		<div
			class="modal-backdrop"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => {
				if (e.target === e.currentTarget) {
					stopAlarm();
					dismissTaskNotification();
					showCompletionModal = false;
				}
			}}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					stopAlarm();
					dismissTaskNotification();
					showCompletionModal = false;
				}
			}}
		>
			<div class="completion-dialog">
				<div class="completion-header">
					<span class="completion-emoji">🎉</span>
					<div class="completion-title-group">
						<h3 class="title-large">Task Finished!</h3>
						<p class="body-medium task-name-label">{taskItems[activeTaskIndex].task.title}</p>
					</div>
				</div>

				<!-- Extra time section -->
				<div class="dialog-section">
					<span class="label-medium section-label">Need more time? (Starts counting down immediately)</span>
					<div class="extra-time-chips">
						<button class="chip-btn" onclick={() => handleAddExtraMinutes(1)}>+1 min</button>
						<button class="chip-btn" onclick={() => handleAddExtraMinutes(2)}>+2 min</button>
						<button class="chip-btn" onclick={() => handleAddExtraMinutes(5)}>+5 min</button>
						<button class="chip-btn" onclick={() => handleAddExtraMinutes(10)}>+10 min</button>
					</div>
				</div>

				<!-- Template duration update section -->
				<div class="dialog-section">
					<span class="label-medium section-label">Future Routine Duration</span>
					<div class="duration-stepper">
						<button
							class="stepper-btn"
							onclick={() => (templateDurationMinutes = Math.max(1, templateDurationMinutes - 1))}
							aria-label="Decrease minutes"
						>
							−
						</button>
						<span class="stepper-value title-medium">{templateDurationMinutes} min</span>
						<button
							class="stepper-btn"
							onclick={() => (templateDurationMinutes = templateDurationMinutes + 1)}
							aria-label="Increase minutes"
						>
							+
						</button>
					</div>

					<label class="template-checkbox-row">
						<input
							type="checkbox"
							bind:checked={updateFutureTemplate}
							class="template-checkbox"
						/>
						<span class="body-medium">
							Update this task to <strong>{templateDurationMinutes} min</strong> for future routine sessions
						</span>
					</label>
				</div>

				<!-- Actions -->
				<div class="dialog-actions">
					<button class="btn-subtle" onclick={() => { stopAlarm(); dismissTaskNotification(); showCompletionModal = false; }}>
						Dismiss
					</button>
					<button class="btn-filled-primary" onclick={confirmCompleteTask}>
						✓ Complete Task
					</button>
				</div>
			</div>
		</div>
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

	/* Completion Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 16px;
		backdrop-filter: blur(2px);
	}

	.completion-dialog {
		background-color: var(--md-sys-color-surface-container-high, #ece6f0);
		color: var(--md-sys-color-on-surface);
		border-radius: var(--md-sys-shape-corner-large);
		padding: 24px;
		width: 100%;
		max-width: 420px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		box-shadow: var(--md-sys-elevation-2);
		animation: dialogPop 0.2s cubic-bezier(0.2, 0, 0, 1);
	}

	@keyframes dialogPop {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.completion-header {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.completion-emoji {
		font-size: 2.25rem;
		line-height: 1;
	}

	.completion-title-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.task-name-label {
		color: var(--md-sys-color-on-surface-variant);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dialog-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 14px;
		background-color: var(--md-sys-color-surface-container);
		border-radius: var(--md-sys-shape-corner-medium);
	}

	.section-label {
		color: var(--md-sys-color-on-surface-variant);
	}

	.extra-time-chips {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}

	.chip-btn {
		padding: 8px 4px;
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-surface);
		color: var(--md-sys-color-primary);
		font: var(--md-sys-typescale-label-medium);
		font-weight: 600;
		cursor: pointer;
		text-align: center;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease;
	}

	.chip-btn:hover {
		background-color: var(--md-sys-color-primary-container);
		border-color: var(--md-sys-color-primary);
	}

	.duration-stepper {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
	}

	.stepper-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1px solid var(--md-sys-color-outline);
		background-color: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		font-size: 1.25rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.2s ease;
	}

	.stepper-btn:hover {
		background-color: var(--md-sys-color-surface-container-highest);
	}

	.stepper-value {
		min-width: 64px;
		text-align: center;
		font-weight: 600;
	}

	.template-checkbox-row {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		margin-top: 4px;
	}

	.template-checkbox {
		width: 18px;
		height: 18px;
		accent-color: var(--md-sys-color-primary);
		cursor: pointer;
	}

	.dialog-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		margin-top: 4px;
	}

	.btn-subtle {
		padding: 10px 18px;
		background: none;
		border: none;
		border-radius: var(--md-sys-shape-corner-full);
		color: var(--md-sys-color-on-surface-variant);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
	}

	.btn-subtle:hover {
		background-color: var(--md-sys-color-surface-container);
	}

	.btn-filled-primary {
		padding: 10px 20px;
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		border: none;
		border-radius: var(--md-sys-shape-corner-full);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		box-shadow: var(--md-sys-elevation-1);
		transition: box-shadow 0.2s ease;
	}

	.btn-filled-primary:hover {
		box-shadow: var(--md-sys-elevation-2);
	}
</style>
