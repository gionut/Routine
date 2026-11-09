import { base } from '$app/paths';

interface ExtendedNotificationOptions extends NotificationOptions {
	vibrate?: number[];
	actions?: Array<{ action: string; title: string; icon?: string }>;
}

/**
 * Requests notification permission from the user.
 * Returns true if permission is granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
	if (typeof window === 'undefined' || !('Notification' in window)) return false;
	if (Notification.permission === 'granted') return true;
	if (Notification.permission === 'denied') return false;

	const result = await Notification.requestPermission();
	return result === 'granted';
}

/**
 * Shows a rich system notification when a task timer completes,
 * with vibration and quick action buttons to add extra time or mark done.
 */
export async function notifyTaskComplete(taskTitle: string, taskId?: number | null): Promise<void> {
	if (typeof window === 'undefined' || !('Notification' in window)) return;
	if (Notification.permission !== 'granted') return;

	const iconUrl = `${base}/pwa-192x192.png`;

	const options: ExtendedNotificationOptions = {
		body: `"${taskTitle}" timer has finished.`,
		icon: iconUrl,
		badge: iconUrl,
		tag: 'task-complete',
		requireInteraction: true,
		vibrate: [200, 100, 200],
		data: { taskId, taskTitle },
		actions: [
			{ action: 'add-2', title: '+2 min' },
			{ action: 'add-5', title: '+5 min' },
			{ action: 'done', title: '✓ Done' }
		]
	};

	if ('serviceWorker' in navigator) {
		try {
			const reg = await navigator.serviceWorker.ready;
			await reg.showNotification('Task Complete! ⏱️', options as NotificationOptions);
			return;
		} catch (e) {
			console.warn('SW showNotification failed, using fallback:', e);
		}
	}

	new Notification('Task Complete! ⏱️', options);
}

/**
 * Shows a notification when all tasks in a routine are completed.
 */
export async function notifyRoutineComplete(routineTitle: string): Promise<void> {
	if (typeof window === 'undefined' || !('Notification' in window)) return;
	if (Notification.permission !== 'granted') return;

	const iconUrl = `${base}/pwa-192x192.png`;

	const options: ExtendedNotificationOptions = {
		body: `You've finished "${routineTitle}".`,
		icon: iconUrl,
		badge: iconUrl,
		tag: 'routine-complete',
		requireInteraction: true,
		vibrate: [200, 100, 200]
	};

	if ('serviceWorker' in navigator) {
		try {
			const reg = await navigator.serviceWorker.ready;
			await reg.showNotification('Routine Complete! 🎉', options as NotificationOptions);
			return;
		} catch (e) {
			console.warn('SW showNotification failed, using fallback:', e);
		}
	}

	new Notification('Routine Complete! 🎉', options);
}
