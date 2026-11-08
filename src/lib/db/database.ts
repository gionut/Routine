import Dexie, { type EntityTable } from 'dexie';
import type { Routine, Task, RoutineSession, TaskProgress, StoredFile, PendingShare } from './types';

const db = new Dexie('RoutineDB') as Dexie & {
	routines: EntityTable<Routine, 'id'>;
	tasks: EntityTable<Task, 'id'>;
	sessions: EntityTable<RoutineSession, 'id'>;
	taskProgress: EntityTable<TaskProgress, 'id'>;
	files: EntityTable<StoredFile, 'id'>;
	pendingShares: EntityTable<PendingShare, 'id'>;
};

db.version(1).stores({
	routines: '++id, title, isActive, sortOrder',
	tasks: '++id, routineId, sortOrder',
	sessions: '++id, routineId, date, status, [routineId+date]',
	taskProgress: '++id, sessionId, taskId, status, [sessionId+taskId]'
});

db.version(2).stores({
	routines: '++id, title, isActive, sortOrder',
	tasks: '++id, routineId, sortOrder',
	sessions: '++id, routineId, date, status, [routineId+date]',
	taskProgress: '++id, sessionId, taskId, status, [sessionId+taskId]',
	files: '++id, name, mimeType, createdAt',
	pendingShares: '++id, createdAt'
});

export { db };
