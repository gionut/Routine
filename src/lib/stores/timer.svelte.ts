import { db } from '$lib/db/database';
import type { TaskProgress } from '$lib/db/types';
import { notifyTaskComplete, dismissTaskNotification } from '$lib/utils/notifications';
import { startAlarm, stopAlarm } from '$lib/utils/audioAlarm';
import { acquireWakeLock, releaseWakeLock } from '$lib/utils/wakeLock';

export interface TimerState {
	progressId: number | null;
	taskId: number | null;
	taskTitle: string;
	totalDuration: number; // seconds
	elapsedSeconds: number;
	remainingSeconds: number;
	status: 'idle' | 'running' | 'paused' | 'completed';
	completedAt?: Date;
	justFinished: boolean;
}

const defaultState: TimerState = {
	progressId: null,
	taskId: null,
	taskTitle: '',
	totalDuration: 0,
	elapsedSeconds: 0,
	remainingSeconds: 0,
	status: 'idle',
	completedAt: undefined,
	justFinished: false
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
		completeNatural();
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
	timerState.completedAt = progress.completedAt;
	timerState.justFinished = false;

	if (progress.status === 'running' && progress.lastResumedAt) {
		// Timer was running when app was closed — recalculate elapsed
		lastResumedAt = new Date(progress.lastResumedAt);
		const elapsed = calculateElapsed();
		if (elapsed >= totalDuration) {
			await completeNatural();
		} else {
			timerState.elapsedSeconds = elapsed;
			timerState.remainingSeconds = totalDuration - elapsed;
			timerState.status = 'running';
			acquireWakeLock();
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
	timerState.justFinished = false;

	await persistProgress({
		status: 'running',
		lastResumedAt: lastResumedAt,
		elapsedSeconds: baseElapsed
	});

	acquireWakeLock();
	startInterval();
}

/**
 * Pause the countdown timer.
 */
export async function pauseTimer() {
	if (timerState.status !== 'running') return;

	const elapsed = calculateElapsed();
	stopInterval();
	releaseWakeLock();
	stopAlarm();

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
 * Internal logic to mark task completed in DB and state.
 */
async function markCompletedInternal(completedAt = new Date()) {
	stopInterval();
	releaseWakeLock();

	timerState.elapsedSeconds = timerState.totalDuration;
	timerState.remainingSeconds = 0;
	timerState.status = 'completed';
	timerState.completedAt = completedAt;

	await persistProgress({
		status: 'completed',
		elapsedSeconds: timerState.totalDuration,
		completedAt,
		lastResumedAt: undefined
	});
}

/**
 * Invoked when timer countdown naturally hits zero.
 */
async function completeNatural(completedAt = new Date()) {
	await markCompletedInternal(completedAt);
	timerState.justFinished = true;
	startAlarm();
	notifyTaskComplete(timerState.taskTitle, timerState.taskId);
}

/**
 * Adds extra time (in seconds) to the current task and immediately resumes counting down.
 * When the extra time completes, the timer will reach 0 again, triggering another completion alert.
 */
export async function addExtraTime(additionalSeconds: number) {
	if (additionalSeconds <= 0) return;
	stopInterval();
	stopAlarm();
	await dismissTaskNotification();

	timerState.totalDuration += additionalSeconds;
	timerState.remainingSeconds += additionalSeconds;
	timerState.status = 'running';
	timerState.justFinished = false;
	lastResumedAt = new Date();
	baseElapsed = timerState.elapsedSeconds;

	await persistProgress({
		status: 'running',
		lastResumedAt,
		elapsedSeconds: baseElapsed
	});

	acquireWakeLock();
	startInterval();
}

/**
 * Manually complete the task (user decides to move on from UI or modal).
 */
export async function completeTask() {
	stopAlarm();
	timerState.justFinished = false;
	await dismissTaskNotification();
	await markCompletedInternal();
}

/**
 * Acknowledge that the completion modal has handled this event.
 */
export function clearJustFinished() {
	timerState.justFinished = false;
}

/**
 * Reset the timer to idle state.
 */
export function resetTimer() {
	stopInterval();
	releaseWakeLock();
	stopAlarm();
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
