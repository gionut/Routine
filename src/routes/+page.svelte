<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { db } from '$lib/db/database';
	import { getActiveRoutines } from '$lib/db/routines';
	import { getTasksForRoutine } from '$lib/db/tasks';
	import { getOrCreateTodaySession } from '$lib/db/sessions';
	import { isRoutineDueToday, describeSchedule } from '$lib/utils/scheduler';
	import { formatDuration } from '$lib/utils/time';
	import type { Routine, Task, RoutineSession } from '$lib/db/types';

	interface TodayRoutine {
		routine: Routine;
		tasks: Task[];
		session: RoutineSession;
		totalDuration: number;
		completedTasks: number;
		activeTask?: Task;
	}

	let todayRoutines = $state<TodayRoutine[]>([]);
	let loading = $state(true);

	const todayDate = new Date().toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
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
				if (session.activeTaskId) {
					activeTask = tasks.find((t) => t.id === session.activeTaskId);
				}
				if (!activeTask && tasks.length > 0) {
					const completedTaskIds = new Set(
						progressEntries.filter((p) => p.status === 'completed').map((p) => p.taskId)
					);
					activeTask = tasks.find((t) => !completedTaskIds.has(t.id!)) ?? tasks[0];
				}

				items.push({ routine, tasks, session, totalDuration, completedTasks, activeTask });
			}

			todayRoutines = items;
		} catch (err) {
			console.error('Failed to load routines:', err);
		} finally {
			loading = false;
		}
	}

	function getProgress(item: TodayRoutine): number {
		if (item.tasks.length === 0) return 0;
		return (item.completedTasks / item.tasks.length) * 100;
	}

	function getStatusLabel(item: TodayRoutine): string {
		if (item.session.status === 'completed') return 'Completed ✓';
		if (item.session.status === 'in-progress') return `${item.completedTasks}/${item.tasks.length} tasks`;
		return 'Not started';
	}

	function getButtonLabel(item: TodayRoutine): string {
		if (item.session.status === 'completed') return 'Review';
		if (item.session.status === 'in-progress') return '▶ Continue';
		return '▶ Start';
	}

	async function startRoutine(item: TodayRoutine) {
		await goto(`/routines/${item.routine.id}/session`);
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
	{:else if todayRoutines.length === 0}
		<div class="empty-state">
			<div class="empty-icon">🎯</div>
			<p class="title-medium">No routines scheduled for today</p>
			<p class="body-medium" style="color: var(--md-sys-color-on-surface-variant)">
				Create a routine to get started
			</p>
			<button class="btn-filled" onclick={() => goto('/routines/new')}>
				+ New Routine
			</button>
		</div>
	{:else}
		<div class="routine-list">
			{#each todayRoutines as item (item.routine.id)}
				<button class="routine-card" onclick={() => startRoutine(item)}>
					<div class="card-header">
						<h3 class="title-medium">{item.routine.title}</h3>
						<span class="body-medium task-count">
							{item.tasks.length} {item.tasks.length === 1 ? 'task' : 'tasks'} · {formatDuration(item.totalDuration)}
						</span>
					</div>

					{#if item.activeTask && item.session.status !== 'completed'}
						<div class="active-task-pill">
							<span class="active-dot">▶</span>
							<span class="active-task-title label-medium">{item.activeTask.title}</span>
						</div>
					{/if}

					<div class="card-progress">
						<div class="progress-bar">
							<div
								class="progress-fill"
								class:completed={item.session.status === 'completed'}
								style="width: {getProgress(item)}%"
							></div>
						</div>
						<span class="label-medium status-label"
							class:completed-label={item.session.status === 'completed'}
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
		gap: 6px;
		padding: 4px 10px;
		background-color: var(--md-sys-color-surface-container);
		border-radius: var(--md-sys-shape-corner-small);
		align-self: flex-start;
	}

	.active-dot {
		font-size: 0.75rem;
		color: var(--md-sys-color-primary);
	}

	.active-task-title {
		color: var(--md-sys-color-on-surface);
		font-weight: 500;
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
