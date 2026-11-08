import { db } from './database';
import type { StoredFile } from './types';

/**
 * Saves a File or Blob into IndexedDB.
 */
export async function saveStoredFile(file: File | Blob, name: string): Promise<number> {
	const now = new Date();
	const id = await db.files.add({
		name,
		mimeType: file.type || 'application/pdf',
		size: file.size,
		createdAt: now,
		blob: file
	});

	return id as number;
}

/**
 * Retrieves a file from IndexedDB by ID.
 */
export async function getStoredFile(id: number): Promise<StoredFile | undefined> {
	return db.files.get(id);
}

/**
 * Deletes a file from IndexedDB by ID.
 */
export async function deleteStoredFile(id: number): Promise<void> {
	await db.files.delete(id);
}

/**
 * Opens a stored PDF file in a new tab/window, optionally navigating to a specific page.
 */
export async function openStoredPdf(fileId: number, page?: number): Promise<boolean> {
	const record = await getStoredFile(fileId);
	if (!record || !record.blob) {
		console.error(`File ID ${fileId} not found in database.`);
		return false;
	}

	const blobUrl = URL.createObjectURL(record.blob);
	const targetUrl = page && page > 0 ? `${blobUrl}#page=${Math.floor(page)}` : blobUrl;

	window.open(targetUrl, '_blank');

	// Release object URL after some time
	setTimeout(() => {
		URL.revokeObjectURL(blobUrl);
	}, 60000);

	return true;
}
