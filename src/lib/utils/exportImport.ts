import { db } from '$lib/db/database';
import type { Routine, Task, RoutineSession, TaskProgress, StoredFile } from '$lib/db/types';

export interface RoutineBackupFile {
	id?: number;
	name: string;
	mimeType: string;
	size: number;
	createdAt: string;
	base64: string;
}

export interface RoutineBackupPayload {
	version: 1;
	appName: 'Routine';
	exportedAt: string;
	routines: Routine[];
	tasks: Task[];
	sessions?: RoutineSession[];
	taskProgress?: TaskProgress[];
	files?: RoutineBackupFile[];
}

export interface ImportResult {
	routinesCount: number;
	tasksCount: number;
	filesCount: number;
	sessionsCount: number;
}

/**
 * Universal helper to convert a Blob into a Base64 string.
 * Supports both browser environments and Node.js test runners.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
	const buffer = await blob.arrayBuffer();
	let binary = '';
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Universal helper to convert a Base64 string back into a binary Blob.
 * Supports both browser environments and Node.js test runners.
 */
export function base64ToBlob(base64: string, mimeType: string = 'application/pdf'): Blob {
	const byteCharacters = atob(base64);
	const byteNumbers = new Array(byteCharacters.length);
	for (let i = 0; i < byteCharacters.length; i++) {
		byteNumbers[i] = byteCharacters.charCodeAt(i);
	}
	const byteArray = new Uint8Array(byteNumbers);
	return new Blob([byteArray], { type: mimeType });
}

/**
 * Exports all routines, tasks, sessions, task progress, and PDF files
 * into a structured, JSON-serializable string.
 */
export async function exportDatabaseToJson(): Promise<string> {
	const [routines, tasks, sessions, taskProgress, rawFiles] = await Promise.all([
		db.routines.toArray(),
		db.tasks.toArray(),
		db.sessions.toArray(),
		db.taskProgress.toArray(),
		db.files.toArray()
	]);

	const files: RoutineBackupFile[] = [];
	for (const file of rawFiles) {
		const base64 = await blobToBase64(file.blob);
		files.push({
			id: file.id,
			name: file.name,
			mimeType: file.mimeType,
			size: file.size,
			createdAt: file.createdAt instanceof Date ? file.createdAt.toISOString() : String(file.createdAt),
			base64
		});
	}

	const payload: RoutineBackupPayload = {
		version: 1,
		appName: 'Routine',
		exportedAt: new Date().toISOString(),
		routines,
		tasks,
		sessions,
		taskProgress,
		files
	};

	return JSON.stringify(payload, null, 2);
}

/**
 * Initiates export delivery.
 * On mobile browsers supporting navigator.share with files, triggers the native share sheet
 * (allowing instant "Save to Drive", WhatsApp, etc.).
 * Otherwise, falls back to direct browser file download.
 */
export async function downloadOrShareBackup(
	jsonString: string,
	filename?: string
): Promise<{ method: 'share' | 'download' }> {
	const dateStr = new Date().toISOString().split('T')[0];
	const finalName = filename || `routine-backup-${dateStr}.json`;

	const blob = new Blob([jsonString], { type: 'application/json' });
	const file = new File([blob], finalName, { type: 'application/json' });

	// Check for Web Share API file sharing support (common on modern mobile Chrome/Safari)
	if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
		try {
			await navigator.share({
				title: 'Routine Backup',
				text: 'Backup of your routines and tasks',
				files: [file]
			});
			return { method: 'share' };
		} catch (err: unknown) {
			// If user cancelled the share sheet, do not force a download
			if (err instanceof Error && err.name === 'AbortError') {
				return { method: 'share' };
			}
			console.warn('Native share failed, falling back to download:', err);
		}
	}

	// Browser direct download fallback
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = finalName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), 1000);

	return { method: 'download' };
}

/**
 * Validates and imports a JSON backup payload into IndexedDB using a Merge & Append strategy.
 * Prevents primary key collisions by remapping old routine, task, and file IDs to newly inserted IDs.
 */
export async function importDatabaseFromJson(jsonString: string): Promise<ImportResult> {
	let payload: RoutineBackupPayload;
	try {
		payload = JSON.parse(jsonString);
	} catch {
		throw new Error('Invalid JSON file format.');
	}

	if (!payload || payload.appName !== 'Routine' || payload.version !== 1) {
		throw new Error('Unsupported backup file. Please ensure this file was exported from Routine.');
	}

	if (!Array.isArray(payload.routines) || !Array.isArray(payload.tasks)) {
		throw new Error('Malformed backup payload: routines and tasks are required.');
	}

	const result: ImportResult = {
		routinesCount: 0,
		tasksCount: 0,
		filesCount: 0,
		sessionsCount: 0
	};

	// Perform transactional import
	await db.transaction('rw', [db.routines, db.tasks, db.files, db.sessions, db.taskProgress], async () => {
		// 1. Remap and insert files
		const fileIdMap = new Map<number, number>();
		if (Array.isArray(payload.files)) {
			for (const fileData of payload.files) {
				const blob = base64ToBlob(fileData.base64, fileData.mimeType);
				const newFileId = (await db.files.add({
					name: fileData.name,
					mimeType: fileData.mimeType,
					size: fileData.size,
					createdAt: new Date(fileData.createdAt || Date.now()),
					blob
				})) as number;
				if (fileData.id !== undefined) {
					fileIdMap.set(fileData.id, newFileId);
				}
				result.filesCount++;
			}
		}

		// 2. Remap and insert routines
		const routineIdMap = new Map<number, number>();
		for (const r of payload.routines) {
			const oldRoutineId = r.id;
			const newRoutineId = (await db.routines.add({
				title: r.title,
				scheduleType: r.scheduleType,
				scheduleInterval: r.scheduleInterval,
				scheduleDays: r.scheduleDays,
				createdAt: new Date(r.createdAt || Date.now()),
				updatedAt: new Date(r.updatedAt || Date.now()),
				isActive: r.isActive ?? true,
				sortOrder: r.sortOrder ?? 0
			})) as number;

			if (oldRoutineId !== undefined) {
				routineIdMap.set(oldRoutineId, newRoutineId);
			}
			result.routinesCount++;
		}

		// 3. Remap and insert tasks
		const taskIdMap = new Map<number, number>();
		for (const t of payload.tasks) {
			const oldTaskId = t.id;
			const mappedRoutineId = routineIdMap.get(t.routineId);
			// Skip task if its parent routine was not imported
			if (mappedRoutineId === undefined) continue;

			// Remap attached file ID if applicable
			let remappedLinkMeta = t.linkMeta ? { ...t.linkMeta } : undefined;
			if (remappedLinkMeta && typeof remappedLinkMeta.fileId === 'number') {
				const newFileId = fileIdMap.get(remappedLinkMeta.fileId);
				if (newFileId !== undefined) {
					remappedLinkMeta.fileId = newFileId;
				}
			}

			const newTaskId = (await db.tasks.add({
				routineId: mappedRoutineId,
				title: t.title,
				duration: t.duration,
				linkType: t.linkType,
				linkUrl: t.linkUrl,
				linkMeta: remappedLinkMeta,
				sortOrder: t.sortOrder ?? 0
			})) as number;

			if (oldTaskId !== undefined) {
				taskIdMap.set(oldTaskId, newTaskId);
			}
			result.tasksCount++;
		}

		// 4. Remap and insert sessions (if included)
		const sessionIdMap = new Map<number, number>();
		if (Array.isArray(payload.sessions)) {
			for (const s of payload.sessions) {
				const oldSessionId = s.id;
				const mappedRoutineId = routineIdMap.get(s.routineId);
				if (mappedRoutineId === undefined) continue;

				const mappedActiveTaskId = s.activeTaskId ? taskIdMap.get(s.activeTaskId) : undefined;

				const newSessionId = (await db.sessions.add({
					routineId: mappedRoutineId,
					date: s.date,
					status: s.status,
					startedAt: s.startedAt ? new Date(s.startedAt) : undefined,
					completedAt: s.completedAt ? new Date(s.completedAt) : undefined,
					activeTaskId: mappedActiveTaskId
				})) as number;

				if (oldSessionId !== undefined) {
					sessionIdMap.set(oldSessionId, newSessionId);
				}
				result.sessionsCount++;
			}
		}

		// 5. Remap and insert task progress entries (if included)
		if (Array.isArray(payload.taskProgress)) {
			for (const p of payload.taskProgress) {
				const mappedSessionId = sessionIdMap.get(p.sessionId);
				const mappedTaskId = taskIdMap.get(p.taskId);
				if (mappedSessionId === undefined || mappedTaskId === undefined) continue;

				await db.taskProgress.add({
					sessionId: mappedSessionId,
					taskId: mappedTaskId,
					elapsedSeconds: p.elapsedSeconds,
					status: p.status,
					linkState: p.linkState,
					lastResumedAt: p.lastResumedAt ? new Date(p.lastResumedAt) : undefined
				});
			}
		}
	});

	return result;
}
