import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/lib/db/database.js';
import { createRoutine } from '../src/lib/db/routines.js';
import { addTask, getTasksForRoutine, updateTask, getTask } from '../src/lib/db/tasks.js';
import {
	getOrCreateTodaySession,
	initializeTaskProgress,
	getTaskProgressForSession,
	updateTaskProgress
} from '../src/lib/db/sessions.js';

test('Timer & Template: Updating task duration modifies future sessions and preserves progress', async () => {
	// 1. Create a routine with a task of 10 minutes (600s)
	const routineId = await createRoutine({
		title: 'Prayer & Meditation Routine',
		scheduleType: 'daily',
		isActive: true
	});

	const taskId = await addTask({
		routineId,
		title: 'Prayer Session',
		duration: 600,
		linkType: 'app',
		linkUrl: 'intent://#Intent;package=net.geero.prayermate;end'
	});

	let task = await getTask(taskId);
	assert.strictEqual(task?.duration, 600);

	// 2. Initialize today's session with the task
	const session = await getOrCreateTodaySession(routineId);
	await initializeTaskProgress(session.id!, routineId);

	let progressList = await getTaskProgressForSession(session.id!);
	assert.strictEqual(progressList.length, 1);
	assert.strictEqual(progressList[0].status, 'pending');

	// 3. User finishes 600s, adds +5 min (300s) extra time, then completes
	// Simulate extra time added: total elapsed is 600 + 300 = 900s
	const finalElapsedSeconds = 900;
	await updateTaskProgress(progressList[0].id!, {
		status: 'completed',
		elapsedSeconds: finalElapsedSeconds
	});

	const updatedProgress = await db.taskProgress.get(progressList[0].id!);
	assert.strictEqual(updatedProgress?.status, 'completed');
	assert.strictEqual(updatedProgress?.elapsedSeconds, 900);

	// 4. User opts to update the task duration for future routine sessions to 15 min (900s)
	await updateTask(taskId, { duration: finalElapsedSeconds });

	const refreshedTask = await getTask(taskId);
	assert.strictEqual(refreshedTask?.duration, 900);

	// 5. Verify that any subsequent query for routine tasks returns the updated 15m duration
	const futureTasks = await getTasksForRoutine(routineId);
	assert.strictEqual(futureTasks.length, 1);
	assert.strictEqual(futureTasks[0].duration, 900);
});

test('Timer Extra Time: Extra time math and looping flow', () => {
	// Simulate timer state transitions on extra time loop
	interface MockTimerState {
		totalDuration: number;
		elapsedSeconds: number;
		remainingSeconds: number;
		status: 'idle' | 'running' | 'paused' | 'completed';
	}

	let state: MockTimerState = {
		totalDuration: 600,
		elapsedSeconds: 600,
		remainingSeconds: 0,
		status: 'completed'
	};

	let notificationCount = 1; // Initial completion notification

	// Helper simulating addExtraTime
	function applyExtraTime(seconds: number) {
		state.totalDuration += seconds;
		state.remainingSeconds += seconds;
		state.status = 'running';
	}

	// Helper simulating tick reaching 0 again (loop completion)
	function completeLoop() {
		state.elapsedSeconds = state.totalDuration;
		state.remainingSeconds = 0;
		state.status = 'completed';
		notificationCount++;
	}

	// 1st extra time: +2m (120s)
	applyExtraTime(120);
	assert.strictEqual(state.status, 'running');
	assert.strictEqual(state.totalDuration, 720);
	assert.strictEqual(state.remainingSeconds, 120);

	// Runs down to 0 -> loops and fires notification again
	completeLoop();
	assert.strictEqual(state.status, 'completed');
	assert.strictEqual(notificationCount, 2);

	// 2nd extra time: +5m (300s)
	applyExtraTime(300);
	assert.strictEqual(state.status, 'running');
	assert.strictEqual(state.totalDuration, 1020);
	assert.strictEqual(state.remainingSeconds, 300);

	// Runs down to 0 -> loops and fires notification again
	completeLoop();
	assert.strictEqual(state.status, 'completed');
	assert.strictEqual(notificationCount, 3);
});
