import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/lib/db/database.js';
import {
	blobToBase64,
	base64ToBlob,
	exportDatabaseToJson,
	importDatabaseFromJson
} from '../src/lib/utils/exportImport.js';

test('ExportImport: blobToBase64 and base64ToBlob round-trip preserves binary content', async () => {
	const originalText = 'Test PDF binary string data with special symbols ⚡ 🚀 12345';
	const originalBlob = new Blob([originalText], { type: 'application/pdf' });

	const base64 = await blobToBase64(originalBlob);
	assert.ok(typeof base64 === 'string' && base64.length > 0);

	const restoredBlob = base64ToBlob(base64, 'application/pdf');
	assert.strictEqual(restoredBlob.type, 'application/pdf');
	assert.strictEqual(restoredBlob.size, originalBlob.size);

	const restoredText = await restoredBlob.text();
	assert.strictEqual(restoredText, originalText);
});

test('ExportImport: exportDatabaseToJson packages routines, tasks, and files with metadata', async () => {
	// Seed a test routine
	const routineId = await db.routines.add({
		title: 'Morning Practice',
		scheduleType: 'daily',
		createdAt: new Date('2026-11-01'),
		updatedAt: new Date('2026-11-01'),
		isActive: true,
		sortOrder: 0
	});

	// Seed a stored PDF file
	const fileBlob = new Blob(['Mock PDF stream'], { type: 'application/pdf' });
	const fileId = await db.files.add({
		name: 'practice-sheet.pdf',
		mimeType: 'application/pdf',
		size: fileBlob.size,
		createdAt: new Date('2026-11-01'),
		blob: fileBlob
	});

	// Seed a task referencing the file
	await db.tasks.add({
		routineId,
		title: 'Reading Sheet',
		duration: 600,
		linkType: 'file',
		linkMeta: { fileId, fileName: 'practice-sheet.pdf', pdfPage: 4 },
		sortOrder: 0
	});

	const json = await exportDatabaseToJson();
	assert.ok(typeof json === 'string');

	const parsed = JSON.parse(json);
	assert.strictEqual(parsed.appName, 'Routine');
	assert.strictEqual(parsed.version, 1);
	assert.ok(Array.isArray(parsed.routines) && parsed.routines.length >= 1);
	assert.ok(Array.isArray(parsed.tasks) && parsed.tasks.length >= 1);
	assert.ok(Array.isArray(parsed.files) && parsed.files.length >= 1);

	const exportedFile = parsed.files.find((f: { name: string }) => f.name === 'practice-sheet.pdf');
	assert.ok(exportedFile);
	assert.ok(exportedFile.base64.length > 0);
});

test('ExportImport: importDatabaseFromJson merges routines and remaps IDs cleanly', async () => {
	// Create mock backup JSON payload
	const fileContent = 'Imported document content';
	const base64 = await blobToBase64(new Blob([fileContent], { type: 'application/pdf' }));

	const backupPayload = {
		version: 1,
		appName: 'Routine',
		exportedAt: '2026-11-08T20:00:00.000Z',
		routines: [
			{
				id: 999, // Old ID that should be remapped
				title: 'Guitar Warmup Routine',
				scheduleType: 'everyN',
				scheduleInterval: 2,
				createdAt: '2026-11-01T00:00:00.000Z',
				updatedAt: '2026-11-01T00:00:00.000Z',
				isActive: true,
				sortOrder: 1
			}
		],
		tasks: [
			{
				id: 888, // Old task ID
				routineId: 999, // Should remap to new routine ID
				title: 'Scales in A Minor',
				duration: 300,
				linkType: 'file',
				linkMeta: { fileId: 777, fileName: 'scales.pdf', pdfPage: 1 },
				sortOrder: 0
			}
		],
		files: [
			{
				id: 777, // Old file ID
				name: 'scales.pdf',
				mimeType: 'application/pdf',
				size: 25,
				createdAt: '2026-11-01T00:00:00.000Z',
				base64
			}
		]
	};

	const initialRoutinesCount = await db.routines.count();
	const initialTasksCount = await db.tasks.count();

	const result = await importDatabaseFromJson(JSON.stringify(backupPayload));

	assert.strictEqual(result.routinesCount, 1);
	assert.strictEqual(result.tasksCount, 1);
	assert.strictEqual(result.filesCount, 1);

	const afterRoutinesCount = await db.routines.count();
	const afterTasksCount = await db.tasks.count();
	assert.strictEqual(afterRoutinesCount, initialRoutinesCount + 1);
	assert.strictEqual(afterTasksCount, initialTasksCount + 1);

	// Verify the newly created routine exists
	const importedRoutine = await db.routines.where('title').equals('Guitar Warmup Routine').first();
	assert.ok(importedRoutine);
	assert.notStrictEqual(importedRoutine.id, 999); // ID was remapped

	// Verify task exists and links to the new routine ID
	const tasksForRoutine = await db.tasks.where('routineId').equals(importedRoutine.id!).toArray();
	const importedTask = tasksForRoutine.find((t) => t.title === 'Scales in A Minor');
	assert.ok(importedTask);
	assert.strictEqual(importedTask.routineId, importedRoutine.id);

	// Verify file was restored and task's fileId was remapped
	const importedFile = await db.files.where('name').equals('scales.pdf').first();
	assert.ok(importedFile);
	assert.notStrictEqual(importedFile.id, 777); // ID was remapped
	assert.strictEqual(importedTask.linkMeta?.fileId, importedFile.id);

	// Verify binary blob content
	const restoredText = await importedFile.blob.text();
	assert.strictEqual(restoredText, fileContent);
});

test('ExportImport: importDatabaseFromJson validates schema and rejects invalid payloads', async () => {
	// Not JSON
	await assert.rejects(async () => {
		await importDatabaseFromJson('not valid json');
	}, /Invalid JSON file format/);

	// Wrong app name
	await assert.rejects(async () => {
		await importDatabaseFromJson(JSON.stringify({ version: 1, appName: 'OtherApp' }));
	}, /Unsupported backup file/);

	// Missing routines array
	await assert.rejects(async () => {
		await importDatabaseFromJson(JSON.stringify({ version: 1, appName: 'Routine' }));
	}, /Malformed backup payload/);
});
