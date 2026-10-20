export type PlaybackSpeed = 15 | 60 | 240;

export const ANNOUNCE_INTERVAL_MS = 10_000;

/**
 * Throttle for the single polite live region. `lastAt` is the real-time ms of the previous
 * announcement (null if none). Reduced motion announces on every step the caller makes.
 */
export function shouldAnnounce(
  lastAt: number | null,
  nowMs: number,
  speed: PlaybackSpeed,
  reduced: boolean
): boolean {
  if (reduced) return true;
  if (speed === 240) return false;
  return lastAt === null || nowMs - lastAt >= ANNOUNCE_INTERVAL_MS;
}
