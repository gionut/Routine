/**
 * Requests notification permission from the user.
 * Returns true if permission is granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
	if (!('Notification' in window)) return false;
	if (Notification.permission === 'granted') return true;
	if (Notification.permission === 'denied') return false;

	const result = await Notification.requestPermission();
	return result === 'granted';
}

/**
 * Shows a browser notification when a task timer completes.
 */
export function notifyTaskComplete(taskTitle: string): void {
	if (!('Notification' in window)) return;
	if (Notification.permission !== 'granted') return;

	new Notification('Timer Complete!', {
		body: `"${taskTitle}" timer has finished.`,
		icon: '/pwa-192x192.svg',
		tag: 'task-complete',
		requireInteraction: true
	});
}

/**
 * Shows a notification when all tasks in a routine are completed.
 */
export function notifyRoutineComplete(routineTitle: string): void {
	if (!('Notification' in window)) return;
	if (Notification.permission !== 'granted') return;

	new Notification('Routine Complete! 🎉', {
		body: `You've finished "${routineTitle}".`,
		icon: '/pwa-192x192.svg',
		tag: 'routine-complete',
		requireInteraction: true
	});
}
