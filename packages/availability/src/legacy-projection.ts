import type { AvailabilityConfig } from "@mbe/types";
import { MINUTES_PER_DAY, WEEKDAYS, type Weekday } from "./types.js";

/**
 * The legacy `Venue.operatingHours` value, derived from the regular week of an
 * availability config (docs/features/venue-availability/architecture.md §
 * Migration): per weekday, the first opening and the last closing across the
 * services that day's undated assignment brings. The store writes it so bundles
 * that still read the column keep working until Phase 2 drops it.
 */

// A type alias (not an interface) so the value is assignable to Prisma's JSON input.
export type LegacyDayHours = {
  open: string;
  close: string;
  closed?: boolean;
};

export type LegacyOperatingHours = Record<Weekday, LegacyDayHours>;

const CLOSED_DAY: LegacyDayHours = { open: "00:00", close: "00:00", closed: true };

/** A minute of the service day as "HH:MM"; a close past midnight wraps, as the legacy column wrote it. */
function clock(minute: number): string {
  const m = minute % MINUTES_PER_DAY;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function projectLegacyOperatingHours(config: AvailabilityConfig): LegacyOperatingHours {
  const regularWeek = config.assignments.filter((a) => !a.startsOn && !a.endsOn);
  const dayHours = (day: Weekday): LegacyDayHours => {
    const stored = (WEEKDAYS.indexOf(day) + 1) % 7;
    const covering = regularWeek
      .filter((a) => a.weekdays.includes(stored))
      .reduce<(typeof regularWeek)[number] | null>(
        (best, a) => (best === null || a.precedence > best.precedence ? a : best),
        null
      );
    const services = covering
      ? config.scheduleServices.filter((s) => s.scheduleId === covering.scheduleId)
      : [];
    if (services.length === 0) return CLOSED_DAY;
    const open = Math.min(...services.map((s) => s.opensAt));
    const close = Math.max(...services.map((s) => s.closesAt));
    return { open: clock(open), close: clock(close) };
  };
  return Object.fromEntries(WEEKDAYS.map((day) => [day, dayHours(day)])) as LegacyOperatingHours;
}
