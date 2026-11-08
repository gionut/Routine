/**
 * Parses shared parameters (title, text, url) from Android's share target.
 */
export interface ParsedShare {
	url?: string;
	title?: string;
	isYouTube: boolean;
	isPdf: boolean;
	ytTimestamp?: number;
}

export function parseShareData(
	titleParam: string | null,
	textParam: string | null,
	urlParam: string | null
): ParsedShare | null {
	const rawTitle = titleParam?.trim() || '';
	const rawText = textParam?.trim() || '';
	const rawUrl = urlParam?.trim() || '';

	if (!rawTitle && !rawText && !rawUrl) {
		return null;
	}

	// Find any HTTP/HTTPS URL in url or text
	let extractedUrl = rawUrl;
	if (!extractedUrl && rawText) {
		const match = rawText.match(/https?:\/\/[^\s]+/i);
		if (match) {
			extractedUrl = match[0];
		}
	}

	// If no URL found in text/url, but text exists and looks like intent
	if (!extractedUrl && rawText.startsWith('intent://')) {
		extractedUrl = rawText;
	}

	// Compute a title
	let cleanTitle = rawTitle;
	if (!cleanTitle && rawText) {
		// Remove URL from text to see if title remains
		const titleCandidate = rawText.replace(extractedUrl, '').trim();
		cleanTitle = titleCandidate || (extractedUrl ? 'Shared Link' : 'Shared Item');
	}
	if (!cleanTitle && extractedUrl) {
		cleanTitle = 'Shared Link';
	}

	const isYouTube = !!extractedUrl && /(?:youtube\.com|youtu\.be)/i.test(extractedUrl);
	const isPdf = !!extractedUrl && /\.pdf(?:$|[?#])/i.test(extractedUrl);

	// Extract YouTube timestamp if present in URL
	let ytTimestamp: number | undefined;
	if (isYouTube && extractedUrl) {
		const timeMatch = extractedUrl.match(/[?&]t=(\d+)s?/i);
		if (timeMatch) {
			ytTimestamp = parseInt(timeMatch[1], 10);
		}
	}

	return {
		url: extractedUrl || undefined,
		title: cleanTitle || undefined,
		isYouTube,
		isPdf,
		ytTimestamp
	};
}
