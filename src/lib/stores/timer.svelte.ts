import { db } from '$lib/db/database';
import type { TaskProgress } from '$lib/db/types';
import { notifyTaskComplete } from '$lib/utils/notifications';

export interface TimerState {
	progressId: number | null;
	taskId: number | null;
	taskTitle: string;
	totalDuration: number; // seconds
	elapsedSeconds: number;
	remainingSeconds: number;
	status: 'idle' | 'running' | 'paused' | 'completed';
}

const defaultState: TimerState = {
	progressId: null,
	taskId: null,
	taskTitle: '',
	totalDuration: 0,
	elapsedSeconds: 0,
	remainingSeconds: 0,
	status: 'idle'
};

let timerState = $state<TimerState>({ ...defaultState });
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastResumedAt: Date | null = null;
let baseElapsed = 0;

function calculateElapsed(): number {
	if (!lastResumedAt) return baseElapsed;
	const now = Date.now();
	const delta = (now - lastResumedAt.getTime()) / 1000;
	return baseElapsed + delta;
}

function tick() {
	const elapsed = calculateElapsed();
	timerState.elapsedSeconds = Math.min(elapsed, timerState.totalDuration);
	timerState.remainingSeconds = Math.max(0, timerState.totalDuration - elapsed);

	if (elapsed >= timerState.totalDuration) {
		complete();
	}
}

function startInterval() {
	stopInterval();
	intervalId = setInterval(tick, 250); // Update 4x/sec for smooth display
}

function stopInterval() {
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
}

async function persistProgress(data: Partial<TaskProgress>) {
	if (timerState.progressId) {
		await db.taskProgress.update(timerState.progressId, data);
	}
}

/**
 * Load a task into the timer. Restores state from DB if task was previously running/paused.
 */
export async function loadTask(
	progressId: number,
	taskId: number,
	taskTitle: string,
	totalDuration: number,
	progress: TaskProgress
) {
	stopInterval();

	baseElapsed = progress.elapsedSeconds;
	lastResumedAt = null;

	timerState.progressId = progressId;
	timerState.taskId = taskId;
	timerState.taskTitle = taskTitle;
	timerState.totalDuration = totalDuration;
	timerState.elapsedSeconds = baseElapsed;
	timerState.remainingSeconds = Math.max(0, totalDuration - baseElapsed);

	if (progress.status === 'running' && progress.lastResumedAt) {
		// Timer was running when app was closed — recalculate elapsed
		lastResumedAt = new Date(progress.lastResumedAt);
		const elapsed = calculateElapsed();
		if (elapsed >= totalDuration) {
			timerState.elapsedSeconds = totalDuration;
			timerState.remainingSeconds = 0;
			timerState.status = 'completed';
			await persistProgress({
				status: 'completed',
				elapsedSeconds: totalDuration,
				lastResumedAt: undefined
			});
			notifyTaskComplete(taskTitle, taskId);
		} else {
			timerState.elapsedSeconds = elapsed;
			timerState.remainingSeconds = totalDuration - elapsed;
			timerState.status = 'running';
			startInterval();
		}
	} else if (progress.status === 'completed') {
		timerState.status = 'completed';
	} else if (progress.status === 'paused') {
		timerState.status = 'paused';
	} else {
		timerState.status = 'idle';
	}
}

/**
 * Start or resume the countdown timer.
 */
export async function resumeTimer() {
	if (timerState.status === 'completed') return;

	lastResumedAt = new Date();
	baseElapsed = timerState.elapsedSeconds;
	timerState.status = 'running';

	await persistProgress({
		status: 'running',
		lastResumedAt: lastResumedAt,
		elapsedSeconds: baseElapsed
	});

	startInterval();
}

/**
 * Pause the countdown timer.
 */
export async function pauseTimer() {
	if (timerState.status !== 'running') return;

	const elapsed = calculateElapsed();
	stopInterval();

	baseElapsed = elapsed;
	lastResumedAt = null;
	timerState.elapsedSeconds = elapsed;
	timerState.remainingSeconds = Math.max(0, timerState.totalDuration - elapsed);
	timerState.status = 'paused';

	await persistProgress({
		status: 'paused',
		elapsedSeconds: elapsed,
		lastResumedAt: undefined
	});
}

/**
 * Mark the current task as completed.
 */
async function complete() {
	stopInterval();

	timerState.elapsedSeconds = timerState.totalDuration;
	timerState.remainingSeconds = 0;
	timerState.status = 'completed';

	await persistProgress({
		status: 'completed',
		elapsedSeconds: timerState.totalDuration,
		lastResumedAt: undefined
	});

	notifyTaskComplete(timerState.taskTitle, timerState.taskId);
}

/**
 * Adds extra time (in seconds) to the current task and immediately resumes counting down.
 * When the extra time completes, the timer will reach 0 again, triggering another completion alert.
 */
export async function addExtraTime(additionalSeconds: number) {
	if (additionalSeconds <= 0) return;
	stopInterval();

	timerState.totalDuration += additionalSeconds;
	timerState.remainingSeconds += additionalSeconds;
	timerState.status = 'running';
	lastResumedAt = new Date();
	baseElapsed = timerState.elapsedSeconds;

	await persistProgress({
		status: 'running',
		lastResumedAt,
		elapsedSeconds: baseElapsed
	});

	startInterval();
}

/**
 * Manually complete the task (user decides to move on).
 */
export async function completeTask() {
	await complete();
}

/**
 * Reset the timer to idle state.
 */
export function resetTimer() {
	stopInterval();
	baseElapsed = 0;
	lastResumedAt = null;
	Object.assign(timerState, { ...defaultState });
}

/**
 * Get the reactive timer state. Use in Svelte components.
 */
export function getTimerState(): TimerState {
	return timerState;
}
