import { db } from './database';
import type { RoutineSession, TaskProgress, Task } from './types';

export function getTodayDateString(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export async function getOrCreateTodaySession(routineId: number): Promise<RoutineSession> {
	const today = getTodayDateString();

	const existing = await db.sessions
		.where('[routineId+date]')
		.equals([routineId, today])
		.first();

	if (existing) {
		return existing;
	}

	const id = await db.sessions.add({
		routineId,
		date: today,
		status: 'pending'
	});

	return (await db.sessions.get(id))!;
}

export async function startSession(sessionId: number): Promise<void> {
	await db.sessions.update(sessionId, {
		status: 'in-progress',
		startedAt: new Date()
	});
}

export async function completeSession(sessionId: number): Promise<void> {
	await db.sessions.update(sessionId, {
		status: 'completed',
		completedAt: new Date()
	});
}

export async function getSessionHistory(
	limit: number = 30
): Promise<(RoutineSession & { routineTitle: string })[]> {
	const sessions = await db.sessions.orderBy('date').reverse().limit(limit).toArray();

	const routineIds = [...new Set(sessions.map((s) => s.routineId))];
	const routines = await db.routines.where('id').anyOf(routineIds).toArray();
	const routineMap = new Map(routines.map((r) => [r.id!, r.title]));

	return sessions.map((session) => ({
		...session,
		routineTitle: routineMap.get(session.routineId) ?? 'Unknown'
	}));
}

export async function initializeTaskProgress(
	sessionId: number,
	routineId: number
): Promise<void> {
	const tasks = await db.tasks.where('routineId').equals(routineId).sortBy('sortOrder');

	await db.transaction('rw', db.taskProgress, async () => {
		await Promise.all(
			tasks.map((task) =>
				db.taskProgress.add({
					sessionId,
					taskId: task.id!,
					elapsedSeconds: 0,
					status: 'pending'
				})
			)
		);
	});
}

export async function getTaskProgressForSession(
	sessionId: number
): Promise<(TaskProgress & { task: Task })[]> {
	const progressEntries = await db.taskProgress
		.where('sessionId')
		.equals(sessionId)
		.toArray();

	const taskIds = progressEntries.map((p) => p.taskId);
	const tasks = await db.tasks.where('id').anyOf(taskIds).toArray();
	const taskMap = new Map(tasks.map((t) => [t.id!, t]));

	return progressEntries
		.map((progress) => ({
			...progress,
			task: taskMap.get(progress.taskId)!
		}))
		.filter((entry) => entry.task !== undefined)
		.sort((a, b) => a.task.sortOrder - b.task.sortOrder);
}

export async function updateTaskProgress(
	progressId: number,
	data: Partial<TaskProgress>
): Promise<void> {
	await db.taskProgress.update(progressId, data);
}
