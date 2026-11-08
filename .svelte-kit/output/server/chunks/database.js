import Dexie from "dexie";
const db = new Dexie("RoutineDB");
db.version(1).stores({
  routines: "++id, title, isActive, sortOrder",
  tasks: "++id, routineId, sortOrder",
  sessions: "++id, routineId, date, status, [routineId+date]",
  taskProgress: "++id, sessionId, taskId, status, [sessionId+taskId]"
});
db.version(2).stores({
  routines: "++id, title, isActive, sortOrder",
  tasks: "++id, routineId, sortOrder",
  sessions: "++id, routineId, date, status, [routineId+date]",
  taskProgress: "++id, sessionId, taskId, status, [sessionId+taskId]",
  files: "++id, name, mimeType, createdAt",
  pendingShares: "++id, createdAt"
});
