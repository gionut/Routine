import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert';
import { parseShareData } from '../src/lib/utils/shareParser.js';
import {
	savePendingShare,
	getLatestPendingShare,
	clearAllPendingShares
} from '../src/lib/db/shares.js';

test('ShareParser: parse various Android share payloads', () => {
	// 1. YouTube shared from YouTube app (URL in text)
	const ytShare = parseShareData(
		null,
		'Check out this video: https://youtu.be/dQw4w9WgXcQ?t=120s',
		null
	);
	assert.ok(ytShare);
	assert.strictEqual(ytShare?.isYouTube, true);
	assert.strictEqual(ytShare?.url, 'https://youtu.be/dQw4w9WgXcQ?t=120s');
	assert.strictEqual(ytShare?.ytTimestamp, 120);

	// 2. Direct URL and title
	const webShare = parseShareData(
		'Learn TypeScript',
		null,
		'https://www.typescriptlang.org/docs/'
	);
	assert.ok(webShare);
	assert.strictEqual(webShare?.title, 'Learn TypeScript');
	assert.strictEqual(webShare?.url, 'https://www.typescriptlang.org/docs/');
	assert.strictEqual(webShare?.isYouTube, false);

	// 3. Online PDF URL
	const pdfShare = parseShareData(
		'Course Notes',
		null,
		'https://example.com/lecture1.pdf'
	);
	assert.ok(pdfShare);
	assert.strictEqual(pdfShare?.isPdf, true);

	// 4. Empty returns null
	assert.strictEqual(parseShareData(null, null, null), null);
	assert.strictEqual(parseShareData('', '   ', ''), null);
});

test('SharesDB: store and retrieve pending shares', async () => {
	await clearAllPendingShares();

	const id = await savePendingShare({
		title: 'Interesting Talk',
		url: 'https://youtube.com/watch?v=123'
	});
	assert.ok(id > 0);

	const latest = await getLatestPendingShare();
	assert.ok(latest);
	assert.strictEqual(latest?.title, 'Interesting Talk');
	assert.strictEqual(latest?.url, 'https://youtube.com/watch?v=123');

	await clearAllPendingShares();
	const empty = await getLatestPendingShare();
	assert.strictEqual(empty, undefined);
});
