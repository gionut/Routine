import type { Routine } from '$lib/db/types';

/**
 * Calculates the number of days between two dates (ignoring time).
 */
function diffDays(from: Date, to: Date): number {
	const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
	const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
	return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Determines whether a routine is scheduled to run on the given date.
 */
export function isRoutineDueToday(routine: Routine, today: Date = new Date()): boolean {
	if (!routine.isActive) return false;

	switch (routine.scheduleType) {
		case 'daily':
			return true;

		case 'everyN':
		case 'custom': {
			const interval = routine.scheduleInterval ?? 1;
			if (interval <= 0) return true;
			const daysSinceCreation = diffDays(routine.createdAt, today);
			return daysSinceCreation >= 0 && daysSinceCreation % interval === 0;
		}

		case 'weekly':
			return (routine.scheduleDays ?? []).includes(today.getDay());

		default:
			return false;
	}
}

/**
 * Returns a human-readable description of the schedule.
 */
export function describeSchedule(routine: Routine): string {
	switch (routine.scheduleType) {
		case 'daily':
			return 'Every day';
		case 'everyN':
			return `Every ${routine.scheduleInterval ?? 1} days`;
		case 'weekly': {
			const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
			const days = (routine.scheduleDays ?? []).map((d) => dayNames[d]).join(', ');
			return `Weekly: ${days}`;
		}
		case 'custom':
			return `Every ${routine.scheduleInterval ?? 1} days (custom)`;
		default:
			return 'Unknown';
	}
}
