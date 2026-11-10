import { db } from './database';
import type { Routine, RoutineSession, TaskProgress, Task } from './types';

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

/**
 * Retrieves all sessions within a given month (year, month: 1-12).
 */
export async function getSessionsForMonth(
	year: number,
	month: number
): Promise<(RoutineSession & { routineTitle: string })[]> {
	const monthStr = String(month).padStart(2, '0');
	const startDate = `${year}-${monthStr}-01`;
	const endDate = `${year}-${monthStr}-31`;

	const sessions = await db.sessions
		.where('date')
		.between(startDate, endDate, true, true)
		.toArray();

	const routineIds = [...new Set(sessions.map((s) => s.routineId))];
	const routines = await db.routines.where('id').anyOf(routineIds).toArray();
	const routineMap = new Map(routines.map((r) => [r.id!, r.title]));

	return sessions.map((session) => ({
		...session,
		routineTitle: routineMap.get(session.routineId) ?? 'Routine'
	}));
}

export interface DayRoutineDetail {
	session?: RoutineSession;
	routine: Routine;
	tasksWithProgress: (TaskProgress & { task: Task })[];
	isCompleted: boolean;
	completedCount: number;
	totalCount: number;
}

/**
 * Retrieves full routine details and task progress records for a specific date.
 */
export async function getSessionsAndTasksForDate(dateStr: string): Promise<DayRoutineDetail[]> {
	const allRoutines = await db.routines.toArray();
	const sessions = await db.sessions.where('date').equals(dateStr).toArray();
	const sessionMap = new Map(sessions.map((s) => [s.routineId, s]));

	const [year, month, day] = dateStr.split('-').map(Number);
	const targetDate = new Date(year, month - 1, day);

	const details: DayRoutineDetail[] = [];

	for (const routine of allRoutines) {
		const session = sessionMap.get(routine.id!);
		// Include if session exists or if routine was active on that day
		if (!session && !routine.isActive) continue;

		const tasks = await db.tasks.where('routineId').equals(routine.id!).sortBy('sortOrder');
		let tasksWithProgress: (TaskProgress & { task: Task })[] = [];

		if (session) {
			tasksWithProgress = await getTaskProgressForSession(session.id!);
		} else {
			tasksWithProgress = tasks.map((t) => ({
				sessionId: 0,
				taskId: t.id!,
				elapsedSeconds: 0,
				status: 'pending',
				task: t
			}));
		}

		const completedCount = tasksWithProgress.filter((t) => t.status === 'completed').length;
		const totalCount = tasksWithProgress.length;
		const isCompleted = totalCount > 0 && completedCount === totalCount;

		details.push({
			session,
			routine,
			tasksWithProgress,
			isCompleted,
			completedCount,
			totalCount
		});
	}

	return details;
}

/**
 * Retroactively marks all due/active routines and their tasks as completed on a past date.
 */
export async function markDayRoutinesCompleted(dateStr: string): Promise<void> {
	const allRoutines = await db.routines.filter((r) => r.isActive).toArray();
	const completedDate = new Date(`${dateStr}T12:00:00`);

	for (const routine of allRoutines) {
		let session = await db.sessions
			.where('[routineId+date]')
			.equals([routine.id!, dateStr])
			.first();

		if (!session) {
			const newId = (await db.sessions.add({
				routineId: routine.id!,
				date: dateStr,
				status: 'completed',
				startedAt: completedDate,
				completedAt: completedDate
			})) as number;
			session = (await db.sessions.get(newId))!;
		} else {
			await db.sessions.update(session.id!, {
				status: 'completed',
				completedAt: completedDate
			});
		}

		await syncTaskProgressForSession(session.id!, routine.id!);
		const progressList = await db.taskProgress.where('sessionId').equals(session.id!).toArray();
		const tasks = await db.tasks.where('routineId').equals(routine.id!).toArray();
		const taskMap = new Map(tasks.map((t) => [t.id!, t]));

		for (const p of progressList) {
			const task = taskMap.get(p.taskId);
			await db.taskProgress.update(p.id!, {
				status: 'completed',
				elapsedSeconds: task ? task.duration : p.elapsedSeconds,
				completedAt: completedDate
			});
		}
	}
}

/**
 * Toggles a single task's completion status on a past or current session.
 */
export async function togglePastTaskProgress(
	progressId: number,
	sessionId: number,
	routineId: number,
	makeCompleted: boolean
): Promise<void> {
	const progress = await db.taskProgress.get(progressId);
	if (!progress) return;

	const task = await db.tasks.get(progress.taskId);
	const targetDuration = task?.duration ?? progress.elapsedSeconds;

	await db.taskProgress.update(progressId, {
		status: makeCompleted ? 'completed' : 'pending',
		elapsedSeconds: makeCompleted ? targetDuration : 0,
		completedAt: makeCompleted ? new Date() : undefined
	});

	// Check if all session tasks are now completed
	const allProgress = await db.taskProgress.where('sessionId').equals(sessionId).toArray();
	const allDone = allProgress.length > 0 && allProgress.every((p) => (p.id === progressId ? makeCompleted : p.status === 'completed'));

	await db.sessions.update(sessionId, {
		status: allDone ? 'completed' : 'in-progress',
		completedAt: allDone ? new Date() : undefined
	});
}
