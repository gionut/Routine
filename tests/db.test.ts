import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/lib/db/database.js';
import {
	createRoutine,
	getRoutine,
	getAllRoutines,
	getActiveRoutines,
	updateRoutine,
	deleteRoutine
} from '../src/lib/db/routines.js';
import {
	addTask,
	getTasksForRoutine,
	updateTask,
	reorderTasks,
	deleteTask
} from '../src/lib/db/tasks.js';
import {
	getOrCreateTodaySession,
	startSession,
	completeSession,
	initializeTaskProgress,
	getTaskProgressForSession,
	updateTaskProgress,
	getSessionHistory
} from '../src/lib/db/sessions.js';

test('DB: Routine CRUD and task lifecycle', async () => {
	// 1. Create Routine
	const routineId = await createRoutine({
		title: 'Spanish Mastery',
		scheduleType: 'daily',
		isActive: true
	});
	assert.ok(routineId > 0);

	const routine = await getRoutine(routineId);
	assert.strictEqual(routine?.title, 'Spanish Mastery');
	assert.strictEqual(routine?.isActive, true);

	// 2. Add Tasks
	const task1Id = await addTask({
		routineId,
		title: 'Vocabulary Drill',
		duration: 600,
		linkType: 'none'
	});
	const task2Id = await addTask({
		routineId,
		title: 'Grammar Lecture',
		duration: 1200,
		linkType: 'url',
		linkUrl: 'https://youtube.com/watch?v=123',
		linkMeta: { ytTimestamp: 45 }
	});
	const task3Id = await addTask({
		routineId,
		title: 'Reading Practice',
		duration: 900,
		linkType: 'url',
		linkUrl: 'https://example.com/story.pdf',
		linkMeta: { pdfPage: 12 }
	});

	let tasks = await getTasksForRoutine(routineId);
	assert.strictEqual(tasks.length, 3);
	assert.strictEqual(tasks[0].title, 'Vocabulary Drill');
	assert.strictEqual(tasks[1].title, 'Grammar Lecture');
	assert.strictEqual(tasks[2].title, 'Reading Practice');

	// 3. Reorder tasks
	await reorderTasks(routineId, [task3Id, task1Id, task2Id]);
	tasks = await getTasksForRoutine(routineId);
	assert.strictEqual(tasks[0].id, task3Id);
	assert.strictEqual(tasks[1].id, task1Id);
	assert.strictEqual(tasks[2].id, task2Id);

	// 4. Session & Progress Lifecycle
	const session = await getOrCreateTodaySession(routineId);
	assert.ok(session.id);
	assert.strictEqual(session.status, 'pending');

	await startSession(session.id!);
	const startedSession = await db.sessions.get(session.id!);
	assert.strictEqual(startedSession?.status, 'in-progress');

	await initializeTaskProgress(session.id!, routineId);
	let progressList = await getTaskProgressForSession(session.id!);
	assert.strictEqual(progressList.length, 3);
	assert.strictEqual(progressList[0].status, 'pending');

	// Update first task progress
	await updateTaskProgress(progressList[0].id!, {
		status: 'completed',
		elapsedSeconds: progressList[0].task.duration
	});
	progressList = await getTaskProgressForSession(session.id!);
	assert.strictEqual(progressList[0].status, 'completed');

	// Complete session
	await completeSession(session.id!);
	const history = await getSessionHistory();
	assert.ok(history.length >= 1);
	assert.strictEqual(history[0].routineTitle, 'Spanish Mastery');
	assert.strictEqual(history[0].status, 'completed');

	// 5. Cascade Delete Routine
	await deleteRoutine(routineId);
	const deletedRoutine = await getRoutine(routineId);
	assert.strictEqual(deletedRoutine, undefined);

	const leftoverTasks = await getTasksForRoutine(routineId);
	assert.strictEqual(leftoverTasks.length, 0);

	const leftoverSessions = await db.sessions.where('routineId').equals(routineId).toArray();
	assert.strictEqual(leftoverSessions.length, 0);

	const leftoverProgress = await db.taskProgress.where('sessionId').equals(session.id!).toArray();
	assert.strictEqual(leftoverProgress.length, 0);
});
