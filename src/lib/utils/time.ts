/**
 * Formats seconds into mm:ss display string.
 */
export function formatTime(totalSeconds: number): string {
	const sign = totalSeconds < 0 ? '-' : '';
	const abs = Math.abs(Math.floor(totalSeconds));
	const hours = Math.floor(abs / 3600);
	const minutes = Math.floor((abs % 3600) / 60);
	const seconds = abs % 60;

	const mm = String(minutes).padStart(2, '0');
	const ss = String(seconds).padStart(2, '0');

	if (hours > 0) {
		const hh = String(hours).padStart(2, '0');
		return `${sign}${hh}:${mm}:${ss}`;
	}
	return `${sign}${mm}:${ss}`;
}

/**
 * Formats seconds into a human-readable duration string (e.g. "1h 30m", "45m", "30s").
 */
export function formatDuration(totalSeconds: number): string {
	const abs = Math.abs(Math.floor(totalSeconds));
	const hours = Math.floor(abs / 3600);
	const minutes = Math.floor((abs % 3600) / 60);

	if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	return `${abs}s`;
}

/**
 * Parses a "minutes" input into seconds.
 */
export function minutesToSeconds(minutes: number): number {
	return Math.floor(minutes * 60);
}

/**
 * Converts seconds to minutes (for display in form inputs).
 */
export function secondsToMinutes(seconds: number): number {
	return Math.round(seconds / 60);
}
