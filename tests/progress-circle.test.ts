import { test } from 'node:test';
import assert from 'node:assert';
import {
	calculateTaskProgressPercent,
	formatTaskRemainingText,
	getTaskStatusIcon
} from '../src/lib/utils/progress.js';

test('Progress: calculateTaskProgressPercent handles zero, intermediate, full and overflow', () => {
	// Zero elapsed
	assert.strictEqual(calculateTaskProgressPercent(0, 300), 0);
	// Zero or negative duration
	assert.strictEqual(calculateTaskProgressPercent(50, 0), 0);
	assert.strictEqual(calculateTaskProgressPercent(50, -10), 0);
	// Negative elapsed
	assert.strictEqual(calculateTaskProgressPercent(-10, 300), 0);

	// Normal intermediate values
	assert.strictEqual(calculateTaskProgressPercent(150, 300), 50);
	assert.strictEqual(calculateTaskProgressPercent(100, 300), 33);
	assert.strictEqual(calculateTaskProgressPercent(200, 300), 67);

	// Exactly 100%
	assert.strictEqual(calculateTaskProgressPercent(300, 300), 100);

	// Overflow past duration clamped to 100
	assert.strictEqual(calculateTaskProgressPercent(350, 300), 100);
});

test('Progress: formatTaskRemainingText formats remaining time and completion status', () => {
	// Not completed, remaining time
	assert.strictEqual(formatTaskRemainingText(0, 300), '5m left');
	assert.strictEqual(formatTaskRemainingText(120, 300), '3m left');
	assert.strictEqual(formatTaskRemainingText(250, 300), '50s left');

	// Completed via flag
	assert.strictEqual(formatTaskRemainingText(120, 300, true), 'Done');

	// Elapsed equals or exceeds duration
	assert.strictEqual(formatTaskRemainingText(300, 300, false), 'Done');
	assert.strictEqual(formatTaskRemainingText(350, 300, false), 'Done');
});

test('Progress: getTaskStatusIcon returns correct indicator icon', () => {
	// Ready / not yet started
	assert.strictEqual(getTaskStatusIcon(0, false), '▶');

	// In progress / paused with elapsed time
	assert.strictEqual(getTaskStatusIcon(45, false), '⏸');

	// Completed
	assert.strictEqual(getTaskStatusIcon(45, true), '✓');
	assert.strictEqual(getTaskStatusIcon(0, true), '✓');
});
