<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { db } from '$lib/db/database';
	import { getActiveRoutines } from '$lib/db/routines';
	import { getTasksForRoutine } from '$lib/db/tasks';
	import { getOrCreateTodaySession } from '$lib/db/sessions';
	import { isRoutineDueToday, describeSchedule } from '$lib/utils/scheduler';
	import { formatDuration } from '$lib/utils/time';
	import {
		calculateTaskProgressPercent,
		formatTaskRemainingText,
		getTaskStatusIcon
	} from '$lib/utils/progress';
	import { getTimerState } from '$lib/stores/timer.svelte';
	import type { Routine, Task, RoutineSession, TaskProgress } from '$lib/db/types';

	interface TodayRoutine {
		routine: Routine;
		tasks: Task[];
		session: RoutineSession;
		totalDuration: number;
		completedTasks: number;
		activeTask?: Task;
		activeTaskProgress?: TaskProgress;
	}

	const timer = getTimerState();
	let todayRoutines = $state<TodayRoutine[]>([]);
	let loading = $state(true);

	const todayDate = new Date().toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});

	const circumference = 2 * Math.PI * 11; // r=11, circumference ~= 69.115

	let sortedTodayRoutines = $derived.by(() => {
		const list = [...todayRoutines];
		list.sort((a, b) => {
			const tierA = getRoutineTier(a);
			const tierB = getRoutineTier(b);
			if (tierA !== tierB) return tierA - tierB;
			return a.routine.sortOrder - b.routine.sortOrder;
		});
		return list;
	});

	onMount(() => {
		loadTodayRoutines();
		// Re-check every 30 seconds for timer updates
		const interval = setInterval(loadTodayRoutines, 30000);
		return () => clearInterval(interval);
	});

	async function loadTodayRoutines() {
		try {
			const allActive = await getActiveRoutines();
			const today = new Date();
			const dueRoutines = allActive.filter((r) => isRoutineDueToday(r, today));

			const items: TodayRoutine[] = [];
			for (const routine of dueRoutines) {
				const tasks = await getTasksForRoutine(routine.id!);
				const session = await getOrCreateTodaySession(routine.id!);
				const totalDuration = tasks.reduce((sum, t) => sum + t.duration, 0);

				// Count completed tasks
				const progressEntries = await db.taskProgress
					.where('sessionId')
					.equals(session.id!)
					.toArray();
				const completedTasks = progressEntries.filter(
					(p) => p.status === 'completed'
				).length;

				// Determine active task (from session.activeTaskId or first non-completed task)
				let activeTask: Task | undefined;
				let activeTaskProgress: TaskProgress | undefined;
				if (session.activeTaskId) {
					activeTask = tasks.find((t) => t.id === session.activeTaskId);
				}
				if (!activeTask && tasks.length > 0) {
					const completedTaskIds = new Set(
						progressEntries.filter((p) => p.status === 'completed').map((p) => p.taskId)
					);
					activeTask = tasks.find((t) => !completedTaskIds.has(t.id!)) ?? tasks[0];
				}
				if (activeTask) {
					activeTaskProgress = progressEntries.find((p) => p.taskId === activeTask.id);
				}

				items.push({
					routine,
					tasks,
					session,
					totalDuration,
					completedTasks,
					activeTask,
					activeTaskProgress
				});
			}

			todayRoutines = items;
		} catch (err) {
			console.error('Failed to load routines:', err);
		} finally {
			loading = false;
		}
	}

	function isItemCompleted(item: TodayRoutine): boolean {
		return item.tasks.length > 0 && item.completedTasks === item.tasks.length;
	}

	function isItemActiveRunning(item: TodayRoutine): boolean {
		if (isItemCompleted(item)) return false;
		if (timer.status === 'running' && item.activeTask && timer.taskId === item.activeTask.id) {
			return true;
		}
		return item.activeTaskProgress?.status === 'running';
	}

	function isItemPausedOrInProgress(item: TodayRoutine): boolean {
		if (isItemCompleted(item)) return false;
		if (isItemActiveRunning(item)) return false;
		if (item.completedTasks > 0) return true;
		if ((item.activeTaskProgress?.elapsedSeconds ?? 0) > 0) return true;
		if (item.activeTaskProgress?.status === 'paused') return true;
		if (item.session.status === 'in-progress') return true;
		return false;
	}

	function isItemInProgress(item: TodayRoutine): boolean {
		return isItemActiveRunning(item) || isItemPausedOrInProgress(item);
	}

	function getRoutineTier(item: TodayRoutine): number {
		if (isItemActiveRunning(item)) return 1;
		if (isItemPausedOrInProgress(item)) return 2;
		if (!isItemCompleted(item)) return 3;
		return 4;
	}

	function formatTimeOnly(date: Date | string | undefined): string {
		if (!date) return '';
		const d = new Date(date);
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	function getTaskPercent(item: TodayRoutine): number {
		if (!item.activeTask) return 0;
		return calculateTaskProgressPercent(
			item.activeTaskProgress?.elapsedSeconds ?? 0,
			item.activeTask.duration
		);
	}

	function getTaskRemaining(item: TodayRoutine): string {
		if (!item.activeTask) return '';
		const isCompleted = item.activeTaskProgress?.status === 'completed';
		if (isCompleted) {
			const timeStr = formatTimeOnly(item.activeTaskProgress?.completedAt);
			return timeStr ? `Done at ${timeStr}` : 'Done';
		}
		return formatTaskRemainingText(
			item.activeTaskProgress?.elapsedSeconds ?? 0,
			item.activeTask.duration,
			false
		);
	}

	function getTaskIcon(item: TodayRoutine): string {
		const isCompleted = item.activeTaskProgress?.status === 'completed';
		return getTaskStatusIcon(
			item.activeTaskProgress?.elapsedSeconds ?? 0,
			isCompleted
		);
	}

	function getProgress(item: TodayRoutine): number {
		if (item.tasks.length === 0) return 0;
		return (item.completedTasks / item.tasks.length) * 100;
	}

	function getStatusLabel(item: TodayRoutine): string {
		if (isItemCompleted(item)) return 'Completed ✓';
		if (isItemInProgress(item)) return `${item.completedTasks}/${item.tasks.length} tasks`;
		return 'Not started';
	}

	function getButtonLabel(item: TodayRoutine): string {
		if (isItemCompleted(item)) return 'Review';
		if (isItemInProgress(item)) return '▶ Continue';
		return '▶ Start';
	}

	async function startRoutine(item: TodayRoutine) {
		await goto(`${base}/routines/${item.routine.id}/session`);
	}
</script>

<div class="today-page">
	<div class="date-header">
		<span class="date-label label-large">📅 {todayDate}</span>
	</div>

	{#if loading}
		<div class="loading-state">
			<p class="body-large">Loading routines...</p>
		</div>
	{:else if sortedTodayRoutines.length === 0}
		<div class="empty-state">
			<div class="empty-icon">🎯</div>
			<p class="title-medium">No routines scheduled for today</p>
			<p class="body-medium" style="color: var(--md-sys-color-on-surface-variant)">
				Create a routine to get started
			</p>
			<button class="btn-filled" onclick={() => goto(`${base}/routines/new`)}>
				+ New Routine
			</button>
		</div>
	{:else}
		<div class="routine-list">
			{#each sortedTodayRoutines as item (item.routine.id)}
				<button class="routine-card" onclick={() => startRoutine(item)}>
					<div class="card-header">
						<h3 class="title-medium">{item.routine.title}</h3>
						<span class="body-medium task-count">
							{item.tasks.length} {item.tasks.length === 1 ? 'task' : 'tasks'} · {formatDuration(item.totalDuration)}
						</span>
					</div>

					{#if item.activeTask && !isItemCompleted(item)}
						<div class="active-task-pill">
							<div class="mini-progress-ring">
								<svg viewBox="0 0 28 28" class="mini-ring-svg">
									<circle cx="14" cy="14" r="11" class="ring-bg" />
									<circle
										cx="14"
										cy="14"
										r="11"
										class="ring-fill"
										class:completed={item.activeTaskProgress?.status === 'completed'}
										stroke-dasharray={circumference}
										stroke-dashoffset={circumference * (1 - getTaskPercent(item) / 100)}
										transform="rotate(-90 14 14)"
									/>
								</svg>
								<span class="mini-ring-icon">{getTaskIcon(item)}</span>
							</div>
							<div class="active-task-texts">
								<span class="active-task-title label-medium">{item.activeTask.title}</span>
								<span class="active-task-time label-small">· {getTaskRemaining(item)}</span>
							</div>
						</div>
					{/if}

					<div class="card-progress">
						<div class="progress-bar">
							<div
								class="progress-fill"
								class:completed={isItemCompleted(item)}
								style="width: {getProgress(item)}%"
							></div>
						</div>
						<span class="label-medium status-label"
							class:completed-label={isItemCompleted(item)}
						>
							{getStatusLabel(item)}
						</span>
					</div>

					<div class="card-action">
						<span class="btn-label label-large">{getButtonLabel(item)}</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.today-page {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.date-header {
		padding: 8px 0;
	}

	.date-label {
		color: var(--md-sys-color-on-surface-variant);
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

	.btn-filled {
		margin-top: 12px;
		padding: 12px 24px;
		border: none;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font: var(--md-sys-typescale-label-large);
		cursor: pointer;
		transition: box-shadow 0.2s ease;
	}

	.btn-filled:hover {
		box-shadow: var(--md-sys-elevation-1);
	}

	.routine-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.routine-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border: none;
		border-radius: var(--md-sys-shape-corner-medium);
		background-color: var(--md-sys-color-surface-container);
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: box-shadow 0.2s ease;
	}

	.routine-card:hover {
		box-shadow: var(--md-sys-elevation-1);
	}

	.routine-card:active {
		box-shadow: none;
	}

	.card-header {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.card-header h3 {
		color: var(--md-sys-color-on-surface);
	}

	.task-count {
		color: var(--md-sys-color-on-surface-variant);
	}

	.active-task-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px 4px 6px;
		background-color: var(--md-sys-color-surface-container-highest);
		border-radius: var(--md-sys-shape-corner-full);
		align-self: flex-start;
		max-width: 100%;
	}

	.mini-progress-ring {
		position: relative;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.mini-ring-svg {
		width: 100%;
		height: 100%;
	}

	.ring-bg {
		fill: none;
		stroke: var(--md-sys-color-outline-variant);
		stroke-width: 3;
		opacity: 0.5;
	}

	.ring-fill {
		fill: none;
		stroke: var(--md-sys-color-primary);
		stroke-width: 3;
		stroke-linecap: round;
		transition: stroke-dashoffset 0.3s ease;
	}

	.ring-fill.completed {
		stroke: #4caf50;
	}

	.mini-ring-icon {
		position: absolute;
		font-size: 0.65rem;
		line-height: 1;
		color: var(--md-sys-color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.active-task-texts {
		display: flex;
		align-items: baseline;
		gap: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.active-task-title {
		color: var(--md-sys-color-on-surface);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.active-task-time {
		color: var(--md-sys-color-on-surface-variant);
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.card-progress {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-surface-container-highest);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: var(--md-sys-shape-corner-full);
		background-color: var(--md-sys-color-primary);
		transition: width 0.3s ease;
	}

	.progress-fill.completed {
		background-color: #4caf50;
	}

	.status-label {
		color: var(--md-sys-color-on-surface-variant);
		white-space: nowrap;
	}

	.completed-label {
		color: #4caf50;
	}

	.card-action {
		display: flex;
		justify-content: flex-end;
	}

	.btn-label {
		color: var(--md-sys-color-primary);
	}
</style>
