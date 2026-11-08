import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/lib/db/database.js';
import { createRoutine } from '../src/lib/db/routines.js';
import { addTask, deleteTask } from '../src/lib/db/tasks.js';
import {
	getOrCreateTodaySession,
	syncTaskProgressForSession,
	getTaskProgressForSession,
	updateTaskProgress
} from '../src/lib/db/sessions.js';

test('Session: routine with 3 tasks has all 3 tasks in session', async () => {
	const routineId = await createRoutine({
		title: 'Morning Routine',
		scheduleType: 'daily',
		isActive: true
	});

	const t1 = await addTask({ routineId, title: 'Warmup', duration: 300, linkType: 'none' });
	const t2 = await addTask({ routineId, title: 'Cardio', duration: 900, linkType: 'none' });
	const t3 = await addTask({ routineId, title: 'Cooldown', duration: 300, linkType: 'none' });

	const session = await getOrCreateTodaySession(routineId);
	await syncTaskProgressForSession(session.id!, routineId);

	const items = await getTaskProgressForSession(session.id!);
	assert.strictEqual(items.length, 3, 'All 3 routine tasks must appear in the session');
	assert.strictEqual(items[0].task.title, 'Warmup');
	assert.strictEqual(items[1].task.title, 'Cardio');
	assert.strictEqual(items[2].task.title, 'Cooldown');
});

test('Session: adding tasks to routine after session creation dynamically syncs them', async () => {
	// Scenario: user creates a routine with 1 task, launches session, then later adds 2 more tasks
	const routineId = await createRoutine({
		title: 'Language Study',
		scheduleType: 'daily',
		isActive: true
	});

	const t1 = await addTask({ routineId, title: 'Vocab Drill', duration: 600, linkType: 'none' });

	// Session is opened and started with 1 task
	const session = await getOrCreateTodaySession(routineId);
	await syncTaskProgressForSession(session.id!, routineId);

	let items = await getTaskProgressForSession(session.id!);
	assert.strictEqual(items.length, 1);

	// User completes part of task 1
	await updateTaskProgress(items[0].id!, {
		status: 'in-progress',
		elapsedSeconds: 150
	});

	// Now user edits the routine and adds 2 more tasks (making 3 tasks total)
	const t2 = await addTask({ routineId, title: 'Grammar Study', duration: 1200, linkType: 'none' });
	const t3 = await addTask({ routineId, title: 'Listening Comprehension', duration: 900, linkType: 'none' });

	// User returns to the session — syncTaskProgressForSession must bring in the 2 new tasks
	await syncTaskProgressForSession(session.id!, routineId);

	items = await getTaskProgressForSession(session.id!);
	assert.strictEqual(items.length, 3, 'Session must now contain all 3 tasks');

	// Verify task 1 preserved its progress and did not get wiped
	assert.strictEqual(items[0].task.id, t1);
	assert.strictEqual(items[0].elapsedSeconds, 150);
	assert.strictEqual(items[0].status, 'in-progress');

	// Verify new tasks were initialized cleanly as pending with 0 elapsed seconds
	assert.strictEqual(items[1].task.id, t2);
	assert.strictEqual(items[1].elapsedSeconds, 0);
	assert.strictEqual(items[1].status, 'pending');

	assert.strictEqual(items[2].task.id, t3);
	assert.strictEqual(items[2].elapsedSeconds, 0);
	assert.strictEqual(items[2].status, 'pending');
});

test('Session: deleting a task from routine removes it from session progress', async () => {
	const routineId = await createRoutine({
		title: 'Reading Routine',
		scheduleType: 'daily',
		isActive: true
	});

	const t1 = await addTask({ routineId, title: 'Chapter 1', duration: 600, linkType: 'none' });
	const t2 = await addTask({ routineId, title: 'Chapter 2', duration: 600, linkType: 'none' });
	const t3 = await addTask({ routineId, title: 'Chapter 3', duration: 600, linkType: 'none' });

	const session = await getOrCreateTodaySession(routineId);
	await syncTaskProgressForSession(session.id!, routineId);

	let items = await getTaskProgressForSession(session.id!);
	assert.strictEqual(items.length, 3);

	// Delete task 2
	await deleteTask(t2);

	// Sync session
	await syncTaskProgressForSession(session.id!, routineId);

	items = await getTaskProgressForSession(session.id!);
	assert.strictEqual(items.length, 2, 'Session must have 2 tasks after deleting 1');
	assert.strictEqual(items[0].task.id, t1);
	assert.strictEqual(items[1].task.id, t3);
});

test('Session: multiple routines in total maintain strict task isolation', async () => {
	// 3 routines in total in the app
	const r1 = await createRoutine({ title: 'Routine 1', scheduleType: 'daily', isActive: true });
	const r2 = await createRoutine({ title: 'Routine 2', scheduleType: 'daily', isActive: true });
	const r3 = await createRoutine({ title: 'Routine 3', scheduleType: 'daily', isActive: true });

	// Routine 1 has 3 tasks
	await addTask({ routineId: r1, title: 'R1 Task 1', duration: 300, linkType: 'none' });
	await addTask({ routineId: r1, title: 'R1 Task 2', duration: 300, linkType: 'none' });
	await addTask({ routineId: r1, title: 'R1 Task 3', duration: 300, linkType: 'none' });

	// Routine 2 has 2 tasks
	await addTask({ routineId: r2, title: 'R2 Task 1', duration: 300, linkType: 'none' });
	await addTask({ routineId: r2, title: 'R2 Task 2', duration: 300, linkType: 'none' });

	// Routine 3 has 1 task
	await addTask({ routineId: r3, title: 'R3 Task 1', duration: 300, linkType: 'none' });

	const s1 = await getOrCreateTodaySession(r1);
	const s2 = await getOrCreateTodaySession(r2);
	const s3 = await getOrCreateTodaySession(r3);

	await syncTaskProgressForSession(s1.id!, r1);
	await syncTaskProgressForSession(s2.id!, r2);
	await syncTaskProgressForSession(s3.id!, r3);

	const items1 = await getTaskProgressForSession(s1.id!);
	const items2 = await getTaskProgressForSession(s2.id!);
	const items3 = await getTaskProgressForSession(s3.id!);

	assert.strictEqual(items1.length, 3, 'Routine 1 session must have exactly 3 tasks');
	assert.strictEqual(items2.length, 2, 'Routine 2 session must have exactly 2 tasks');
	assert.strictEqual(items3.length, 1, 'Routine 3 session must have exactly 1 task');

	assert.deepStrictEqual(
		items1.map((i) => i.task.title),
		['R1 Task 1', 'R1 Task 2', 'R1 Task 3']
	);
	assert.deepStrictEqual(
		items2.map((i) => i.task.title),
		['R2 Task 1', 'R2 Task 2']
	);
	assert.deepStrictEqual(
		items3.map((i) => i.task.title),
		['R3 Task 1']
	);
});
