import committedVideos from "./shipped-videos.json";

/**
 * Hand-edited promo/demo videos for shipped features. Kept apart from
 * `shipped-features.json` because that snapshot is regenerated weekly and would
 * overwrite any video field. Files live in `public/videos/` and are served
 * same-origin, so the edge CSP needs no `media-src`.
 */
export interface ShippedVideo {
  readonly slug: string;
  /** Same-origin path under `/videos/`, always an `.mp4`. */
  readonly src: string;
  readonly title: string;
  /** Narration text, shown under the player for accessibility. */
  readonly transcript: string;
  /** Calendar date, `YYYY-MM-DD`. */
  readonly recordedAt: string;
}

export interface ShippedVideosFile {
  readonly videos: readonly ShippedVideo[];
}

const VIDEO_SRC = /^\/videos\/[A-Za-z0-9._-]+\.mp4$/;

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

function isShippedVideo(value: unknown): value is ShippedVideo {
  if (!isObj(value)) return false;
  return (
    isNonEmptyString(value.slug) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.transcript) &&
    isNonEmptyString(value.recordedAt) &&
    !Number.isNaN(Date.parse(value.recordedAt)) &&
    isNonEmptyString(value.src) &&
    VIDEO_SRC.test(value.src) &&
    !value.src.includes("..")
  );
}

/** Runtime guard for a videos file that crossed a file boundary. */
export function isShippedVideosFile(value: unknown): value is ShippedVideosFile {
  return isObj(value) && Array.isArray(value.videos) && value.videos.every(isShippedVideo);
}

/** Valid videos, newest `recordedAt` first. A malformed file yields `[]`. */
export function selectShippedVideos(raw: unknown): readonly ShippedVideo[] {
  if (!isShippedVideosFile(raw)) return [];
  return [...raw.videos].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
}

export function findShippedVideoIn(
  videos: readonly ShippedVideo[],
  slug: string
): ShippedVideo | undefined {
  return videos.find((video) => video.slug === slug);
}

export function latestShippedVideoIn(videos: readonly ShippedVideo[]): ShippedVideo | undefined {
  return videos[0];
}

/** Validated, sorted videos from the committed file. */
export const SHIPPED_VIDEOS: readonly ShippedVideo[] = selectShippedVideos(committedVideos);

export const findShippedVideo = (slug: string): ShippedVideo | undefined =>
  findShippedVideoIn(SHIPPED_VIDEOS, slug);

export const latestShippedVideo = (): ShippedVideo | undefined =>
  latestShippedVideoIn(SHIPPED_VIDEOS);
