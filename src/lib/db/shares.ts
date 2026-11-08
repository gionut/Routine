import { db } from './database';
import type { PendingShare } from './types';

/**
 * Saves an incoming shared item to the database.
 */
export async function savePendingShare(
	data: Omit<PendingShare, 'id' | 'createdAt'>
): Promise<number> {
	const id = await db.pendingShares.add({
		...data,
		createdAt: new Date()
	});

	return id as number;
}

/**
 * Retrieves the most recent pending share.
 */
export async function getLatestPendingShare(): Promise<PendingShare | undefined> {
	return db.pendingShares.orderBy('createdAt').last();
}

/**
 * Deletes a pending share by ID.
 */
export async function deletePendingShare(id: number): Promise<void> {
	await db.pendingShares.delete(id);
}

/**
 * Clears all pending shares.
 */
export async function clearAllPendingShares(): Promise<void> {
	await db.pendingShares.clear();
}
