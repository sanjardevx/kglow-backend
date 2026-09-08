import { TutorialPlatform } from "../enums/tutorial.enum";

/**
 * Turns a pasted YouTube/Instagram link into what the schema actually needs
 * (platform + embed id) — the only thing the admin form ever sends is the
 * raw URL. Never downloads or proxies the video itself.
 */

const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/,
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
];

const INSTAGRAM_ID_PATTERN =
  /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/;

export interface ParsedTutorialLink {
  platform: TutorialPlatform;
  embedId: string;
}

export function parseTutorialLink(url: string): ParsedTutorialLink | null {
  if (!url) return null;

  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return { platform: TutorialPlatform.YOUTUBE, embedId: match[1] };
  }

  const igMatch = url.match(INSTAGRAM_ID_PATTERN);
  if (igMatch)
    return { platform: TutorialPlatform.INSTAGRAM, embedId: igMatch[1] };

  return null;
}

/**
 * Best-effort thumbnail lookup. YouTube's oEmbed endpoint is public — no API
 * key needed. Instagram's oEmbed now requires a Meta app access token we
 * don't have, so Instagram links come back with no thumbnail; the admin grid
 * and SPA fall back to rendering the live embed instead of a static image.
 */
export async function fetchTutorialThumbnail(
  parsed: ParsedTutorialLink,
  originalUrl: string,
): Promise<string | undefined> {
  if (parsed.platform !== TutorialPlatform.YOUTUBE) return undefined;

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(originalUrl)}&format=json`,
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.thumbnail_url as string | undefined;
  } catch (err) {
    console.log("Error, fetchTutorialThumbnail:", err);
    return undefined;
  }
}
