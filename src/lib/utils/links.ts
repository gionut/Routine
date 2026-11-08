import type { Task } from '$lib/db/types';
import { openStoredPdf } from '$lib/db/files';

/**
 * Builds the URL to open for a task, incorporating metadata like YouTube timestamps or PDF page numbers.
 */
export function buildTaskLink(task: Task): string | null {
	if (task.linkType === 'none') return null;

	if (task.linkType === 'file') {
		return task.linkMeta?.fileName ? `file://${task.linkMeta.fileName}` : 'file://document.pdf';
	}

	if (!task.linkUrl) return null;

	let url = task.linkUrl;
	const meta = task.linkMeta ?? {};

	// YouTube: append timestamp if available
	if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
		const timestamp = meta.ytTimestamp as number | undefined;
		if (timestamp && timestamp > 0) {
			const sep = url.includes('?') ? '&' : '?';
			url += `${sep}t=${Math.floor(timestamp)}s`;
		}
	}

	// PDF: append page number if available
	if (url.toLowerCase().includes('.pdf')) {
		const page = meta.pdfPage as number | undefined;
		if (page && page > 0) {
			const baseUrl = url.split('#')[0];
			url = `${baseUrl}#page=${Math.floor(page)}`;
		}
	}

	return url;
}

/**
 * Opens a task's link in a new browser tab, viewer, or via intent.
 * Must be called from a user gesture (click handler) for intent:// URLs on Android.
 */
export async function openTaskLink(task: Task): Promise<void> {
	if (task.linkType === 'file' && task.linkMeta?.fileId) {
		await openStoredPdf(task.linkMeta.fileId, task.linkMeta.pdfPage);
		return;
	}

	const url = buildTaskLink(task);
	if (url && !url.startsWith('file://')) {
		window.open(url, '_blank');
	}
}

/**
 * Returns a human-readable description of the link type.
 */
export function describeLinkType(task: Task): string {
	if (task.linkType === 'none') return 'No link';
	if (task.linkType === 'file') return 'Offline PDF';
	if (!task.linkUrl) return 'No link';

	const url = task.linkUrl.toLowerCase();
	if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
	if (url.includes('.pdf')) return 'Online PDF';
	if (task.linkType === 'intent' || url.startsWith('intent://')) return 'App';
	return 'Website';
}
