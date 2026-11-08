import { test } from 'node:test';
import assert from 'node:assert';
import { isRoutineDueToday, describeSchedule } from '../src/lib/utils/scheduler.js';
import { buildTaskLink, describeLinkType } from '../src/lib/utils/links.js';
import { formatTime, formatDuration, minutesToSeconds, secondsToMinutes } from '../src/lib/utils/time.js';
import type { Routine, Task } from '../src/lib/db/types.js';

test('Scheduler: daily routine is always due', () => {
	const routine: Routine = {
		title: 'Daily Vocab',
		scheduleType: 'daily',
		createdAt: new Date('2026-11-01'),
		updatedAt: new Date('2026-11-01'),
		isActive: true,
		sortOrder: 0
	};
	assert.strictEqual(isRoutineDueToday(routine, new Date('2026-11-01')), true);
	assert.strictEqual(isRoutineDueToday(routine, new Date('2026-11-08')), true);
});

test('Scheduler: inactive routine is never due', () => {
	const routine: Routine = {
		title: 'Inactive',
		scheduleType: 'daily',
		createdAt: new Date('2026-11-01'),
		updatedAt: new Date('2026-11-01'),
		isActive: false,
		sortOrder: 0
	};
	assert.strictEqual(isRoutineDueToday(routine, new Date('2026-11-08')), false);
});

test('Scheduler: every N days routine', () => {
	const routine: Routine = {
		title: 'Alternate Days Gym',
		scheduleType: 'everyN',
		scheduleInterval: 2,
		createdAt: new Date('2026-11-01'),
		updatedAt: new Date('2026-11-01'),
		isActive: true,
		sortOrder: 0
	};
	assert.strictEqual(isRoutineDueToday(routine, new Date('2026-11-01')), true); // day 0
	assert.strictEqual(isRoutineDueToday(routine, new Date('2026-11-02')), false); // day 1
	assert.strictEqual(isRoutineDueToday(routine, new Date('2026-11-03')), true); // day 2
});

test('Scheduler: weekly routine', () => {
	const routine: Routine = {
		title: 'Weekend Reading',
		scheduleType: 'weekly',
		scheduleDays: [0, 6], // Sun, Sat
		createdAt: new Date('2026-11-01'),
		updatedAt: new Date('2026-11-01'),
		isActive: true,
		sortOrder: 0
	};
	// 2026-11-08 is Sunday (day 0)
	const sunday = new Date('2026-11-08T12:00:00');
	// 2026-11-09 is Monday (day 1)
	const monday = new Date('2026-11-09T12:00:00');
	assert.strictEqual(isRoutineDueToday(routine, sunday), true);
	assert.strictEqual(isRoutineDueToday(routine, monday), false);
});

test('Links: YouTube URL with and without timestamp', () => {
	const taskWithTime: Task = {
		routineId: 1,
		title: 'Video',
		duration: 600,
		linkType: 'url',
		linkUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		linkMeta: { ytTimestamp: 145 },
		sortOrder: 0
	};
	assert.strictEqual(
		buildTaskLink(taskWithTime),
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=145s'
	);

	const taskWithoutTime: Task = {
		routineId: 1,
		title: 'Video',
		duration: 600,
		linkType: 'url',
		linkUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		sortOrder: 0
	};
	assert.strictEqual(
		buildTaskLink(taskWithoutTime),
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
	);
});

test('Links: PDF URL with page number', () => {
	const taskWithPage: Task = {
		routineId: 1,
		title: 'Textbook',
		duration: 1800,
		linkType: 'url',
		linkUrl: 'https://example.com/books/spanish.pdf',
		linkMeta: { pdfPage: 42 },
		sortOrder: 0
	};
	assert.strictEqual(
		buildTaskLink(taskWithPage),
		'https://example.com/books/spanish.pdf#page=42'
	);
});

test('Links: Intent URI', () => {
	const intentTask: Task = {
		routineId: 1,
		title: 'Duolingo App',
		duration: 900,
		linkType: 'intent',
		linkUrl: 'intent://duolingo#Intent;package=com.duolingo;end',
		sortOrder: 0
	};
	assert.strictEqual(
		buildTaskLink(intentTask),
		'intent://duolingo#Intent;package=com.duolingo;end'
	);
	assert.strictEqual(describeLinkType(intentTask), 'App');
});

test('Time: formatting and conversions', () => {
	assert.strictEqual(formatTime(0), '00:00');
	assert.strictEqual(formatTime(65), '01:05');
	assert.strictEqual(formatTime(3665), '01:01:05');

	assert.strictEqual(formatDuration(45), '45s');
	assert.strictEqual(formatDuration(300), '5m');
	assert.strictEqual(formatDuration(5400), '1h 30m');

	assert.strictEqual(minutesToSeconds(15), 900);
	assert.strictEqual(secondsToMinutes(900), 15);
});
