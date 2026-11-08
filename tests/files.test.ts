import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/lib/db/database.js';
import { saveStoredFile, getStoredFile, deleteStoredFile } from '../src/lib/db/files.js';
import { buildTaskLink, describeLinkType } from '../src/lib/utils/links.js';
import type { Task } from '../src/lib/db/types.js';

test('Files: store and retrieve PDF blob in IndexedDB', async () => {
	const content = 'Mock PDF binary content';
	const blob = new Blob([content], { type: 'application/pdf' });
	const fileName = 'advanced-grammar.pdf';

	const fileId = await saveStoredFile(blob, fileName);
	assert.ok(fileId > 0);

	const retrieved = await getStoredFile(fileId);
	assert.ok(retrieved);
	assert.strictEqual(retrieved?.name, fileName);
	assert.strictEqual(retrieved?.mimeType, 'application/pdf');
	assert.strictEqual(retrieved?.size, blob.size);

	// Test task link representation for local files
	const task: Task = {
		routineId: 1,
		title: 'Read Textbook',
		duration: 1800,
		linkType: 'file',
		linkMeta: {
			fileId,
			fileName,
			pdfPage: 15
		},
		sortOrder: 0
	};

	assert.strictEqual(buildTaskLink(task), 'file://advanced-grammar.pdf');
	assert.strictEqual(describeLinkType(task), 'Offline PDF');

	// Delete file
	await deleteStoredFile(fileId);
	const afterDelete = await getStoredFile(fileId);
	assert.strictEqual(afterDelete, undefined);
});
