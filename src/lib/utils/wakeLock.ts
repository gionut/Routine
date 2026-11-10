/**
 * Screen Wake Lock utility using navigator.wakeLock.
 * Keeps the screen awake while tasks are actively running so Android does not sleep or freeze timers.
 */

let sentinel: WakeLockSentinel | null = null;
let shouldKeepAwake = false;

async function requestLock() {
	if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
	try {
		sentinel = await navigator.wakeLock.request('screen');
		sentinel.addEventListener('release', () => {
			sentinel = null;
		});
	} catch (e) {
		// Can happen if low battery or tab in background
		console.debug('Wake lock request denied or unsupported:', e);
	}
}

// Automatically re-acquire when returning to foreground if still requested
if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', async () => {
		if (document.visibilityState === 'visible' && shouldKeepAwake && !sentinel) {
			await requestLock();
		}
	});
}

/**
 * Acquire screen wake lock to keep screen on while timer runs.
 */
export async function acquireWakeLock(): Promise<void> {
	shouldKeepAwake = true;
	if (!sentinel) {
		await requestLock();
	}
}

/**
 * Release screen wake lock (allows device to sleep normally).
 */
export async function releaseWakeLock(): Promise<void> {
	shouldKeepAwake = false;
	if (sentinel) {
		try {
			await sentinel.release();
		} catch {}
		sentinel = null;
	}
}
