import { db } from './database';
import type { Routine } from './types';

export async function createRoutine(
	data: Omit<Routine, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>
): Promise<number> {
	const now = new Date();
	const maxSortOrder = await db.routines.orderBy('sortOrder').last();
	const sortOrder = (maxSortOrder?.sortOrder ?? -1) + 1;

	const id = await db.routines.add({
		...data,
		createdAt: now,
		updatedAt: now,
		sortOrder
	});

	return id as number;
}

export async function updateRoutine(id: number, data: Partial<Routine>): Promise<void> {
	await db.routines.update(id, {
		...data,
		updatedAt: new Date()
	});
}

export async function deleteRoutine(id: number): Promise<void> {
	await db.transaction('rw', [db.routines, db.tasks, db.sessions, db.taskProgress], async () => {
		const rawTaskIds = await db.tasks.where('routineId').equals(id).primaryKeys();
		const rawSessionIds = await db.sessions.where('routineId').equals(id).primaryKeys();
		const taskIds = rawTaskIds.filter((k): k is number => k !== undefined);
		const sessionIds = rawSessionIds.filter((k): k is number => k !== undefined);

		if (sessionIds.length > 0) {
			await db.taskProgress
				.where('sessionId')
				.anyOf(sessionIds)
				.delete();
		}

		if (taskIds.length > 0) {
			await db.taskProgress
				.where('taskId')
				.anyOf(taskIds)
				.delete();
		}

		await db.tasks.where('routineId').equals(id).delete();
		await db.sessions.where('routineId').equals(id).delete();
		await db.routines.delete(id);
	});
}

export async function getRoutine(id: number): Promise<Routine | undefined> {
	return db.routines.get(id);
}

export async function getAllRoutines(): Promise<Routine[]> {
	return db.routines.orderBy('sortOrder').toArray();
}

export async function getActiveRoutines(): Promise<Routine[]> {
	return db.routines.filter((r) => r.isActive).sortBy('sortOrder');
}
