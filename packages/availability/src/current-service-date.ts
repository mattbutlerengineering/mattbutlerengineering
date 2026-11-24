import { addDays } from "./civil-date.js";
import { localDateTimeOf } from "./instant.js";
import { resolveDay, type AvailabilitySnapshot } from "./resolve-day.js";
import { MINUTES_PER_DAY } from "./types.js";

/**
 * The service day "tonight" means right now (ADR-029): today's civil date when one of its
 * services is open, else yesterday's when its service runs past midnight and is still open,
 * else today's. A Fri 22:00-02:00 service at Sat 00:30 is still Friday's.
 */
export function currentServiceDate(snapshot: AvailabilitySnapshot, now: Date): string {
  const local = localDateTimeOf(now, snapshot.timezone);
  const isOpen = (date: string, minute: number): boolean =>
    resolveDay(snapshot, date).services.some((s) => s.opensAt <= minute && minute < s.closesAt);
  if (isOpen(local.date, local.minute)) return local.date;
  const yesterday = addDays(local.date, -1);
  return isOpen(yesterday, local.minute + MINUTES_PER_DAY) ? yesterday : local.date;
}

/**
 * The service day a closing summary means: the one that last opened. Until today's first
 * service opens (or when today has none) that is yesterday's, even after its service has
 * closed, which `currentServiceDate` alone would already have rolled forward to today.
 */
export function lastServiceDate(snapshot: AvailabilitySnapshot, now: Date): string {
  const local = localDateTimeOf(now, snapshot.timezone);
  const opensAts = resolveDay(snapshot, local.date).services.map((s) => s.opensAt);
  const todayOpened = opensAts.length > 0 && local.minute >= Math.min(...opensAts);
  return todayOpened ? currentServiceDate(snapshot, now) : addDays(local.date, -1);
}
