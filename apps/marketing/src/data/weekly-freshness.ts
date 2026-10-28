import type { WeeklyResource } from "./weekly-intake.js";

/** How recent an item must be to be offered as "what I'm reading". */
const READING_WINDOW_DAYS = 45;
const MAX_READING_ITEMS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const byNewest = (a: WeeklyResource, b: WeeklyResource): number =>
  b.publishedAt.localeCompare(a.publishedAt);

/**
 * Items recent enough to present as current reading, newest first. Empty when
 * the intake has gone stale, so the homepage can drop the section rather than
 * advertise six-month-old links as this week's.
 */
export function recentReadingItems(
  resources: readonly WeeklyResource[],
  now: Date = new Date()
): readonly WeeklyResource[] {
  const cutoff = now.getTime() - READING_WINDOW_DAYS * MS_PER_DAY;
  return resources
    .filter((resource) => new Date(resource.publishedAt).getTime() >= cutoff)
    .sort(byNewest)
    .slice(0, MAX_READING_ITEMS);
}

/** Newest publish date across the intake, or null when it is empty. */
export function latestPublishedAt(resources: readonly WeeklyResource[]): string | null {
  return [...resources].sort(byNewest)[0]?.publishedAt ?? null;
}
