export interface PresetApp {
	id: string;
	name: string;
	icon: string;
	packageName: string;
	fallbackUrl: string;
}

export const PRESET_APPS: PresetApp[] = [
	{
		id: 'kindle',
		name: 'Amazon Kindle',
		icon: '📖',
		packageName: 'com.amazon.kindle',
		fallbackUrl: 'https://play.google.com/store/apps/details?id=com.amazon.kindle'
	},
	{
		id: 'bible',
		name: 'YouVersion Bible',
		icon: '✝️',
		packageName: 'com.sirma.mobile.bible.android',
		fallbackUrl: 'https://play.google.com/store/apps/details?id=com.sirma.mobile.bible.android'
	},
	{
		id: 'groundnews',
		name: 'Ground News',
		icon: '📰',
		packageName: 'com.checkitt',
		fallbackUrl: 'https://play.google.com/store/apps/details?id=com.checkitt'
	},
	{
		id: 'perfectear',
		name: 'Perfect Ear',
		icon: '🎵',
		packageName: 'com.evilduck.musiciankit',
		fallbackUrl: 'https://play.google.com/store/apps/details?id=com.evilduck.musiciankit'
	},
	{
		id: 'crossword',
		name: 'Crossword',
		icon: '🧩',
		packageName: 'com.redstonegames.crossword.en',
		fallbackUrl: 'https://play.google.com/store/apps/details?id=com.redstonegames.crossword.en'
	},
	{
		id: 'vocab',
		name: 'Vocabulary Builder',
		icon: '📚',
		packageName: 'com.magoosh.vocabulary.builder',
		fallbackUrl: 'https://play.google.com/store/apps/details?id=com.magoosh.vocabulary.builder'
	},
	{
		id: 'prayermate',
		name: 'PrayerMate',
		icon: '🙏',
		packageName: 'net.geero.prayermate',
		fallbackUrl: 'https://play.google.com/store/apps/details?id=net.geero.prayermate'
	}
];

/**
 * Builds a standard Android Chrome Intent URI targeting an app package
 * with a graceful browser fallback URL (Google Play Store).
 */
export function buildAppIntentUrl(app: PresetApp): string {
	const encodedFallback = encodeURIComponent(app.fallbackUrl);
	return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${app.packageName};S.browser_fallback_url=${encodedFallback};end;`;
}

/**
 * Finds a preset app by its ID.
 */
export function getPresetAppById(id: string): PresetApp | undefined {
	return PRESET_APPS.find((app) => app.id === id);
}

/**
 * Finds a preset app by its Android package name.
 */
export function getPresetAppByPackage(packageName: string): PresetApp | undefined {
	return PRESET_APPS.find((app) => app.packageName.toLowerCase() === packageName.toLowerCase());
}
