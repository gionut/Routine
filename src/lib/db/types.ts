export interface Routine {
	id?: number;
	title: string;
	scheduleType: 'daily' | 'everyN' | 'weekly' | 'custom';
	scheduleInterval?: number;
	scheduleDays?: number[];
	createdAt: Date;
	updatedAt: Date;
	isActive: boolean;
	sortOrder: number;
}

export interface Task {
	id?: number;
	routineId: number;
	title: string;
	duration: number; // seconds
	linkType: 'url' | 'intent' | 'file' | 'none';
	linkUrl?: string;
	linkMeta?: {
		ytTimestamp?: number;
		pdfPage?: number;
		fileId?: number;
		fileName?: string;
		fileSize?: number;
		[key: string]: unknown;
	};
	sortOrder: number;
}

export interface RoutineSession {
	id?: number;
	routineId: number;
	date: string; // 'YYYY-MM-DD'
	status: 'pending' | 'in-progress' | 'completed' | 'skipped';
	startedAt?: Date;
	completedAt?: Date;
	activeTaskId?: number;
}

export interface TaskProgress {
	id?: number;
	sessionId: number;
	taskId: number;
	elapsedSeconds: number;
	status: 'pending' | 'running' | 'paused' | 'completed';
	linkState?: Record<string, unknown>;
	lastResumedAt?: Date;
}

export interface StoredFile {
	id?: number;
	name: string;
	mimeType: string;
	size: number;
	createdAt: Date;
	blob: Blob;
}

export interface PendingShare {
	id?: number;
	title?: string;
	text?: string;
	url?: string;
	fileId?: number;
	fileName?: string;
	createdAt: Date;
}
