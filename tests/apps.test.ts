import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert';
import {
	PRESET_APPS,
	buildAppIntentUrl,
	getPresetAppById,
	getPresetAppByPackage
} from '../src/lib/constants/apps.js';
import { buildTaskLink, describeLinkType } from '../src/lib/utils/links.js';
import { db } from '../src/lib/db/database.js';
import { createRoutine } from '../src/lib/db/routines.js';
import { addTask, getTasksForRoutine } from '../src/lib/db/tasks.js';
import { getOrCreateTodaySession, syncTaskProgressForSession, getTaskProgressForSession } from '../src/lib/db/sessions.js';
import type { Task } from '../src/lib/db/types.js';

test('Apps: all 6 preset apps are defined with packages and valid fallbacks', () => {
	assert.strictEqual(PRESET_APPS.length, 6);

	const expectedApps = [
		{ id: 'kindle', name: 'Amazon Kindle', pkg: 'com.amazon.kindle', icon: '📖' },
		{ id: 'bible', name: 'YouVersion Bible', pkg: 'com.sirma.mobile.bible.android', icon: '✝️' },
		{ id: 'groundnews', name: 'Ground News', pkg: 'com.checkitt', icon: '📰' },
		{ id: 'perfectear', name: 'Perfect Ear', pkg: 'com.evilduck.musiciankit', icon: '🎵' },
		{ id: 'crossword', name: 'Crossword', pkg: 'com.redstonegames.crossword.en', icon: '🧩' },
		{ id: 'vocab', name: 'Vocabulary Builder', pkg: 'com.magoosh.vocabulary.builder', icon: '📚' }
	];

	for (const expected of expectedApps) {
		const app = getPresetAppById(expected.id);
		assert.ok(app, `Preset app ${expected.id} must exist`);
		assert.strictEqual(app.name, expected.name);
		assert.strictEqual(app.packageName, expected.pkg);
		assert.strictEqual(app.icon, expected.icon);
		assert.ok(app.fallbackUrl.startsWith('https://play.google.com/store/apps/details?id='));

		const byPkg = getPresetAppByPackage(expected.pkg);
		assert.strictEqual(byPkg?.id, expected.id);
	}
});

test('Apps: buildAppIntentUrl constructs valid Chrome intent URI with encoded fallback', () => {
	const kindle = getPresetAppById('kindle')!;
	const intentUrl = buildAppIntentUrl(kindle);

	assert.ok(intentUrl.startsWith('intent:#Intent;'));
	assert.ok(intentUrl.includes('package=com.amazon.kindle;'));
	assert.ok(intentUrl.includes('S.browser_fallback_url=https%3A%2F%2Fplay.google.com'));
	assert.ok(intentUrl.endsWith(';end;'));
});

test('Apps: buildTaskLink and describeLinkType format app tasks correctly', () => {
	const kindle = getPresetAppById('kindle')!;
	const task: Task = {
		id: 1,
		routineId: 10,
		title: 'Read Kindle',
		duration: 1800,
		linkType: 'app',
		linkUrl: buildAppIntentUrl(kindle),
		linkMeta: {
			appId: kindle.id,
			appName: kindle.name,
			appIcon: kindle.icon,
			packageName: kindle.packageName
		},
		sortOrder: 0
	};

	const link = buildTaskLink(task);
	assert.ok(link?.includes('package=com.amazon.kindle'));

	const desc = describeLinkType(task);
	assert.strictEqual(desc, '📖 Amazon Kindle');
});

test('Apps: routine task creation with app link persists and syncs to session', async () => {
	const routineId = await createRoutine({
		title: 'Reading & Ear Training',
		scheduleType: 'daily',
		isActive: true
	});

	const kindle = getPresetAppById('kindle')!;
	const ear = getPresetAppById('perfectear')!;

	const t1 = await addTask({
		routineId,
		title: kindle.name,
		duration: 1800,
		linkType: 'app',
		linkUrl: buildAppIntentUrl(kindle),
		linkMeta: {
			appId: kindle.id,
			appName: kindle.name,
			appIcon: kindle.icon,
			packageName: kindle.packageName
		}
	});

	const t2 = await addTask({
		routineId,
		title: ear.name,
		duration: 900,
		linkType: 'app',
		linkUrl: buildAppIntentUrl(ear),
		linkMeta: {
			appId: ear.id,
			appName: ear.name,
			appIcon: ear.icon,
			packageName: ear.packageName
		}
	});

	const tasks = await getTasksForRoutine(routineId);
	assert.strictEqual(tasks.length, 2);
	assert.strictEqual(tasks[0].linkType, 'app');
	assert.strictEqual(tasks[0].linkMeta?.appId, 'kindle');
	assert.strictEqual(tasks[1].linkType, 'app');
	assert.strictEqual(tasks[1].linkMeta?.appId, 'perfectear');

	// Session initialization & retrieval
	const session = await getOrCreateTodaySession(routineId);
	await syncTaskProgressForSession(session.id!, routineId);

	const items = await getTaskProgressForSession(session.id!);
	assert.strictEqual(items.length, 2);
	assert.strictEqual(items[0].task.title, 'Amazon Kindle');
	assert.strictEqual(describeLinkType(items[0].task), '📖 Amazon Kindle');
	assert.strictEqual(items[1].task.title, 'Perfect Ear');
	assert.strictEqual(describeLinkType(items[1].task), '🎵 Perfect Ear');
});
