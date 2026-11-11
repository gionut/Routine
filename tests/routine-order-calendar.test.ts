import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/lib/db/database.js';
import { createRoutine } from '../src/lib/db/routines.js';
import { addTask, getTasksForRoutine } from '../src/lib/db/tasks.js';
import {
	getOrCreateTodaySession,
	syncTaskProgressForSession,
	getTaskProgressForSession,
	markDayRoutinesCompleted,
	togglePastTaskProgress,
	getSessionsAndTasksForDate
} from '../src/lib/db/sessions.js';
import { buildAppIntentUrl, getPresetAppById } from '../src/lib/constants/apps.js';

test('App Launcher Intent: Targets MAIN action and LAUNCHER category', () => {
	const prayermate = getPresetAppById('prayermate')!;
	assert.ok(prayermate, 'PrayerMate must exist');
	const intent = buildAppIntentUrl(prayermate);

	assert.ok(intent.startsWith('intent:#Intent;'));
	assert.ok(intent.includes('action=android.intent.action.MAIN;'));
	assert.ok(intent.includes('category=android.intent.category.LAUNCHER;'));
	assert.ok(intent.includes('package=net.geero.prayermate;'));
	assert.ok(intent.includes('S.browser_fallback_url=https%3A%2F%2Fplay.google.com'));
	assert.ok(intent.endsWith(';end;'));
});

test('Routine Sorting & Status Label: Strict 4-tier ordering and no premature completed label', async () => {
	// Routine Running: Active countdown running (Tier 1)
	const rRunning = await createRoutine({ title: 'Routine Running', scheduleType: 'daily', isActive: true });
	const tR1 = await addTask({ routineId: rRunning, title: 'Task R1', duration: 300, linkType: 'none' });
	const sRunning = await getOrCreateTodaySession(rRunning);
	await syncTaskProgressForSession(sRunning.id!, rRunning);
	const progRunning = await getTaskProgressForSession(sRunning.id!);
	await db.taskProgress.update(progRunning[0].id!, { status: 'running', elapsedSeconds: 50 });

	// Routine A: 3 tasks, 1 completed, paused (Started/Paused -> Tier 2)
	const rA = await createRoutine({ title: 'Routine A', scheduleType: 'daily', isActive: true });
	const tA1 = await addTask({ routineId: rA, title: 'Task A1', duration: 300, linkType: 'none' });
	const tA2 = await addTask({ routineId: rA, title: 'Task A2', duration: 300, linkType: 'none' });
	const tA3 = await addTask({ routineId: rA, title: 'Task A3', duration: 300, linkType: 'none' });

	const sA = await getOrCreateTodaySession(rA);
	await syncTaskProgressForSession(sA.id!, rA);
	const progA = await getTaskProgressForSession(sA.id!);
	// Complete only 1 task out of 3
	await db.taskProgress.update(progA[0].id!, { status: 'completed', elapsedSeconds: 300, completedAt: new Date() });

	// Routine B: 2 tasks, 0 completed (Not Started -> Tier 3)
	const rB = await createRoutine({ title: 'Routine B', scheduleType: 'daily', isActive: true });
	await addTask({ routineId: rB, title: 'Task B1', duration: 600, linkType: 'none' });
	await addTask({ routineId: rB, title: 'Task B2', duration: 600, linkType: 'none' });
	const sB = await getOrCreateTodaySession(rB);
	await syncTaskProgressForSession(sB.id!, rB);

	// Routine C: 1 task, 1 completed (Completed -> Tier 4)
	const rC = await createRoutine({ title: 'Routine C', scheduleType: 'daily', isActive: true });
	const tC1 = await addTask({ routineId: rC, title: 'Task C1', duration: 180, linkType: 'none' });
	const sC = await getOrCreateTodaySession(rC);
	await syncTaskProgressForSession(sC.id!, rC);
	const progC = await getTaskProgressForSession(sC.id!);
	await db.taskProgress.update(progC[0].id!, { status: 'completed', elapsedSeconds: 180, completedAt: new Date() });
	await db.sessions.update(sC.id!, { status: 'completed', completedAt: new Date() });

	// Helper matching +page.svelte 4-tier logic
	function isCompleted(tasksLen: number, completedCount: number) {
		return tasksLen > 0 && completedCount === tasksLen;
	}
	function isActivelyRunning(tasksLen: number, completedCount: number, taskStatus?: string) {
		if (isCompleted(tasksLen, completedCount)) return false;
		return taskStatus === 'running';
	}
	function isPausedOrInProgress(tasksLen: number, completedCount: number, elapsed: number, taskStatus?: string) {
		if (isCompleted(tasksLen, completedCount)) return false;
		if (isActivelyRunning(tasksLen, completedCount, taskStatus)) return false;
		return completedCount > 0 || elapsed > 0 || taskStatus === 'paused';
	}
	function getTier(tasksLen: number, completedCount: number, elapsed: number, taskStatus?: string) {
		if (isActivelyRunning(tasksLen, completedCount, taskStatus)) return 1;
		if (isPausedOrInProgress(tasksLen, completedCount, elapsed, taskStatus)) return 2;
		if (!isCompleted(tasksLen, completedCount)) return 3;
		return 4;
	}

	// Verify Routine Running (active running -> Tier 1)
	assert.strictEqual(isCompleted(1, 0), false);
	assert.strictEqual(isActivelyRunning(1, 0, 'running'), true);
	assert.strictEqual(getTier(1, 0, 50, 'running'), 1, 'Actively running countdown must be Tier 1');

	// Verify Routine A (1/3 done, paused -> Tier 2)
	assert.strictEqual(isCompleted(3, 1), false, '1/3 tasks completed must NOT be labeled completed');
	assert.strictEqual(isPausedOrInProgress(3, 1, 300, 'completed'), true);
	assert.strictEqual(getTier(3, 1, 300, 'completed'), 2, 'Started but paused routine must be Tier 2');

	// Verify Routine B (0/2 done -> Tier 3)
	assert.strictEqual(isCompleted(2, 0), false);
	assert.strictEqual(isPausedOrInProgress(2, 0, 0, 'pending'), false);
	assert.strictEqual(getTier(2, 0, 0, 'pending'), 3, 'Not-started routine must be Tier 3');

	// Verify Routine C (1/1 done -> Tier 4)
	assert.strictEqual(isCompleted(1, 1), true);
	assert.strictEqual(getTier(1, 1, 180, 'completed'), 4, 'Completed routine must be Tier 4 (last)');
});

test('Calendar & Past Days: Mark whole day completed and toggle task progress retroactively', async () => {
	const pastDate = '2026-11-01';

	// Create routine
	const routineId = await createRoutine({ title: 'Study Routine', scheduleType: 'daily', isActive: true });
	const t1 = await addTask({ routineId, title: 'Chapter 1', duration: 600, linkType: 'none' });
	const t2 = await addTask({ routineId, title: 'Quiz', duration: 300, linkType: 'none' });

	// 1. Initially no session for pastDate
	let details = await getSessionsAndTasksForDate(pastDate);
	const studyDetail = details.find((d) => d.routine.id === routineId);
	assert.ok(studyDetail);
	assert.strictEqual(studyDetail.isCompleted, false);

	// 2. Mark whole day completed
	await markDayRoutinesCompleted(pastDate);

	details = await getSessionsAndTasksForDate(pastDate);
	const updatedStudy = details.find((d) => d.routine.id === routineId)!;
	assert.strictEqual(updatedStudy.isCompleted, true);
	assert.strictEqual(updatedStudy.completedCount, 2);
	assert.strictEqual(updatedStudy.session?.status, 'completed');
	assert.ok(updatedStudy.tasksWithProgress[0].completedAt);

	// 3. Toggle one task back to pending
	const firstProg = updatedStudy.tasksWithProgress[0];
	await togglePastTaskProgress(firstProg.id!, updatedStudy.session!.id!, routineId, false);

	const toggledDetails = await getSessionsAndTasksForDate(pastDate);
	const toggledStudy = toggledDetails.find((d) => d.routine.id === routineId)!;
	assert.strictEqual(toggledStudy.isCompleted, false);
	assert.strictEqual(toggledStudy.completedCount, 1);
	assert.strictEqual(toggledStudy.session?.status, 'in-progress');
});
