import type { Task } from '$lib/db/types';
import { openStoredPdf } from '$lib/db/files';
import { getPresetAppById, buildAppIntentUrl } from '$lib/constants/apps';

/**
 * Builds the URL to open for a task, incorporating metadata like YouTube timestamps, PDF page numbers, or app intents.
 */
export function buildTaskLink(task: Task): string | null {
	if (task.linkType === 'none') return null;

	if (task.linkType === 'file') {
		return task.linkMeta?.fileName ? `file://${task.linkMeta.fileName}` : 'file://document.pdf';
	}

	if (task.linkType === 'app') {
		if (task.linkUrl) return task.linkUrl;
		const appId = task.linkMeta?.appId as string | undefined;
		if (appId) {
			const preset = getPresetAppById(appId);
			if (preset) return buildAppIntentUrl(preset);
		}
		return null;
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
	if (!url || url.startsWith('file://')) return;

	if (url.startsWith('intent:')) {
		if (typeof document !== 'undefined') {
			const a = document.createElement('a');
			a.href = url;
			a.rel = 'noopener';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		} else if (typeof window !== 'undefined') {
			window.location.href = url;
		}
	} else {
		window.open(url, '_blank');
	}
}

/**
 * Returns a human-readable description of the link type.
 */
export function describeLinkType(task: Task): string {
	if (task.linkType === 'none') return 'No link';
	if (task.linkType === 'file') return 'Offline PDF';

	if (task.linkType === 'app') {
		const name = (task.linkMeta?.appName as string) || 'App';
		const icon = (task.linkMeta?.appIcon as string) || '📱';
		return `${icon} ${name}`;
	}

	if (!task.linkUrl) return 'No link';

	const url = task.linkUrl.toLowerCase();
	if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
	if (url.includes('.pdf')) return 'Online PDF';
	if (task.linkType === 'intent' || url.startsWith('intent:')) {
		if (task.linkMeta?.appName) {
			const icon = (task.linkMeta?.appIcon as string) || '📱';
			return `${icon} ${task.linkMeta.appName}`;
		}
		return 'App';
	}
	return 'Website';
}
