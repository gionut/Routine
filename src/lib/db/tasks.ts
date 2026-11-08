import { db } from './database';
import type { Task } from './types';

export async function addTask(data: Omit<Task, 'id' | 'sortOrder'>): Promise<number> {
	const existing = await db.tasks.where('routineId').equals(data.routineId).toArray();
	const maxSortOrder = existing.reduce((max, t) => Math.max(max, t.sortOrder), -1);

	const id = await db.tasks.add({
		...data,
		sortOrder: maxSortOrder + 1
	});

	return id as number;
}

export async function updateTask(id: number, data: Partial<Task>): Promise<void> {
	await db.tasks.update(id, data);
}

export async function deleteTask(id: number): Promise<void> {
	await db.transaction('rw', [db.tasks, db.taskProgress], async () => {
		await db.taskProgress.where('taskId').equals(id).delete();
		await db.tasks.delete(id);
	});
}

export async function getTasksForRoutine(routineId: number): Promise<Task[]> {
	return db.tasks.where('routineId').equals(routineId).sortBy('sortOrder');
}

export async function reorderTasks(routineId: number, taskIds: number[]): Promise<void> {
	await db.transaction('rw', db.tasks, async () => {
		await Promise.all(
			taskIds.map((id, index) => db.tasks.update(id, { sortOrder: index }))
		);
	});
}
