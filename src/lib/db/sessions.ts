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

export async function setActiveTaskForSession(
	sessionId: number,
	taskId: number
): Promise<void> {
	await db.sessions.update(sessionId, {
		activeTaskId: taskId
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

export async function syncTaskProgressForSession(
	sessionId: number,
	routineId: number
): Promise<void> {
	const tasks = await db.tasks.where('routineId').equals(routineId).sortBy('sortOrder');
	const progressEntries = await db.taskProgress
		.where('sessionId')
		.equals(sessionId)
		.toArray();

	const existingTaskIds = new Set(progressEntries.map((p) => p.taskId));
	const currentTaskIds = new Set(tasks.map((t) => t.id!));

	// Deduplicate any repeated progress entries for the same taskId in this session
	const seenTaskIds = new Set<number>();
	const duplicatesToDelete: number[] = [];
	for (const p of progressEntries) {
		if (seenTaskIds.has(p.taskId)) {
			duplicatesToDelete.push(p.id!);
		} else {
			seenTaskIds.add(p.taskId);
		}
	}

	// 1. Add progress records for missing tasks
	const toAdd = tasks
		.filter((t) => !existingTaskIds.has(t.id!))
		.map((t) => ({
			sessionId,
			taskId: t.id!,
			elapsedSeconds: 0,
			status: 'pending' as const
		}));

	if (toAdd.length > 0) {
		await db.taskProgress.bulkAdd(toAdd);
	}

	// 2. Remove progress records for tasks that were deleted from the routine
	const toDelete = progressEntries
		.filter((p) => !currentTaskIds.has(p.taskId))
		.map((p) => p.id!)
		.concat(duplicatesToDelete);

	if (toDelete.length > 0) {
		await db.taskProgress.bulkDelete(toDelete);
	}
}

export async function initializeTaskProgress(
	sessionId: number,
	routineId: number
): Promise<void> {
	await syncTaskProgressForSession(sessionId, routineId);
}

export async function getTaskProgressForSession(
	sessionId: number
): Promise<(TaskProgress & { task: Task })[]> {
	const progressEntries = await db.taskProgress
		.where('sessionId')
		.equals(sessionId)
		.toArray();

	if (progressEntries.length === 0) {
		return [];
	}

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
