import Dexie, { type EntityTable } from 'dexie';
import type { Routine, Task, RoutineSession, TaskProgress } from './types';

const db = new Dexie('RoutineDB') as Dexie & {
	routines: EntityTable<Routine, 'id'>;
	tasks: EntityTable<Task, 'id'>;
	sessions: EntityTable<RoutineSession, 'id'>;
	taskProgress: EntityTable<TaskProgress, 'id'>;
};

db.version(1).stores({
	routines: '++id, title, isActive, sortOrder',
	tasks: '++id, routineId, sortOrder',
	sessions: '++id, routineId, date, status, [routineId+date]',
	taskProgress: '++id, sessionId, taskId, status, [sessionId+taskId]'
});

export { db };
