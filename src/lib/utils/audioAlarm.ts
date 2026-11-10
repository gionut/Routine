/**
 * Web Audio API synthesized melodic alarm chime for timer completion.
 * Loops a gentle harmonic arpeggio (D5 -> A5) every 1.2s and vibrates the device.
 * Automatically stops after 60 seconds or immediately when stopAlarm() is called.
 */

let audioCtx: AudioContext | null = null;
let chimeIntervalId: ReturnType<typeof setInterval> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let isPlaying = false;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!audioCtx) {
		const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (AudioContextClass) {
			audioCtx = new AudioContextClass();
		}
	}
	if (audioCtx && audioCtx.state === 'suspended') {
		audioCtx.resume().catch(() => {});
	}
	return audioCtx;
}

/**
 * Plays a single gentle melodic two-tone chime burst (D5 -> A5)
 */
function playChimeBurst() {
	const ctx = getAudioContext();
	if (!ctx) return;

	try {
		const now = ctx.currentTime;

		// Note 1: D5 (587.33 Hz)
		const osc1 = ctx.createOscillator();
		const gain1 = ctx.createGain();
		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(587.33, now);

		gain1.gain.setValueAtTime(0, now);
		gain1.gain.linearRampToValueAtTime(0.25, now + 0.05);
		gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

		osc1.connect(gain1);
		gain1.connect(ctx.destination);
		osc1.start(now);
		osc1.stop(now + 0.5);

		// Note 2: A5 (880 Hz) - slightly delayed
		const osc2 = ctx.createOscillator();
		const gain2 = ctx.createGain();
		osc2.type = 'sine';
		osc2.frequency.setValueAtTime(880, now + 0.12);

		gain2.gain.setValueAtTime(0, now + 0.12);
		gain2.gain.linearRampToValueAtTime(0.25, now + 0.17);
		gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

		osc2.connect(gain2);
		gain2.connect(ctx.destination);
		osc2.start(now + 0.12);
		osc2.stop(now + 0.7);

		// Companion device vibration
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
			navigator.vibrate([250, 100, 250]);
		}
	} catch (e) {
		console.warn('Audio chime playback failed:', e);
	}
}

/**
 * Starts continuous alarm chime loop (with companion vibration).
 * Automatically silences after 60 seconds if not cancelled sooner.
 */
export function startAlarm(): void {
	if (isPlaying) return;
	isPlaying = true;

	// Immediate first chime
	playChimeBurst();

	// Repeat every 1.2s
	chimeIntervalId = setInterval(playChimeBurst, 1200);

	// 60-second safety timeout
	timeoutId = setTimeout(() => {
		stopAlarm();
	}, 60000);
}

/**
 * Stops continuous alarm chime and cancels vibration.
 */
export function stopAlarm(): void {
	if (!isPlaying) return;
	isPlaying = false;

	if (chimeIntervalId !== null) {
		clearInterval(chimeIntervalId);
		chimeIntervalId = null;
	}

	if (timeoutId !== null) {
		clearTimeout(timeoutId);
		timeoutId = null;
	}

	if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
		navigator.vibrate(0);
	}
}

/**
 * Checks whether the alarm is currently ringing.
 */
export function isAlarmPlaying(): boolean {
	return isPlaying;
}
