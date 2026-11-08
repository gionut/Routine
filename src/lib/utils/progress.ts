import { formatDuration } from './time';

/**
 * Calculates the progress percentage (0 - 100) for a task given elapsed seconds and total duration.
 */
export function calculateTaskProgressPercent(elapsedSeconds: number, duration: number): number {
	if (duration <= 0) return 0;
	if (elapsedSeconds <= 0) return 0;
	return Math.min(100, Math.round((elapsedSeconds / duration) * 100));
}

/**
 * Formats the remaining time label for a task (e.g. "5m left", "Done").
 */
export function formatTaskRemainingText(
	elapsedSeconds: number,
	duration: number,
	isCompleted: boolean = false
): string {
	if (isCompleted || (duration > 0 && elapsedSeconds >= duration)) {
		return 'Done';
	}
	const remaining = Math.max(0, duration - elapsedSeconds);
	return `${formatDuration(remaining)} left`;
}

/**
 * Returns the status icon for the center of the mini circular progress ring:
 * - '✓' when completed
 * - '⏸' when partially done / paused (> 0 elapsed seconds)
 * - '▶' when ready / not yet started
 */
export function getTaskStatusIcon(
	elapsedSeconds: number,
	isCompleted: boolean = false
): string {
	if (isCompleted) return '✓';
	if (elapsedSeconds > 0) return '⏸';
	return '▶';
}
