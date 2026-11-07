import type { AvailabilityConfig } from "@mbe/types";
import { addDays } from "./civil-date.js";
import { listSlots, type BookingChannel, type EngineTable } from "./slots.js";
import type { ServiceDate } from "./types.js";

// ── The regular week as a guest sees it ──────────────────────────────────────────────────────

/** The config with only live regular schedules' assignments and no date rules: the saved week, or a draft of it. */
export function regularWeekView(config: AvailabilityConfig): AvailabilityConfig {
  const regular = new Set(
    config.schedules.filter((s) => s.kind === "regular" && !s.archivedAt).map((s) => s.id)
  );
  return {
    ...config,
    assignments: config.assignments.filter((a) => regular.has(a.scheduleId)),
    dateRules: [],
  };
}

export interface WeekSpansOptions {
  /** IANA zone of the venue. */
  timezone: string;
  /** The first of seven consecutive service dates. */
  from: ServiceDate;
  partySize: number;
  /** The venue's active tables; none means no party check (nothing to check against). */
  tables: readonly EngineTable[];
  /** The only clock the function reads. */
  now: Date;
  /** The guest's channel; online by default. */
  channel?: BookingChannel;
}

/** One running service on one date: its first and last bookable time, in minutes past the service day's midnight. */
export interface ServiceSpan {
  venueServiceId: string;
  firstAt: number;
  lastAt: number;
  /** The venue has active tables and none fits the party; the service still runs. */
  noTableFits: boolean;
}

export interface DaySpans {
  serviceDate: ServiceDate;
  /** In opening order; a service with nothing bookable that day is left out. */
  services: ServiceSpan[];
}

const DAYS_IN_WEEK = 7;

/**
 * Seven consecutive dates of what `listSlots` offers, per running service: first and last
 * bookable time, so a strip, a calendar line and a guest preview all read the engine's own answer.
 */
export function weekSpans(config: AvailabilityConfig, options: WeekSpansOptions): DaySpans[] {
  const { timezone, from, partySize, tables, now, channel = "online" } = options;
  const snapshot = {
    timezone,
    config,
    tables: [...tables],
    reservations: [],
    holds: [],
    settings: null,
  };
  return Array.from({ length: DAYS_IN_WEEK }, (_, offset) => {
    const serviceDate = addDays(from, offset);
    const slots = listSlots(snapshot, serviceDate, partySize, channel, now);
    const byService = new Map<string, typeof slots>();
    for (const slot of slots) {
      byService.set(slot.venueServiceId, [...(byService.get(slot.venueServiceId) ?? []), slot]);
    }
    const services = [...byService].map(([venueServiceId, own]): ServiceSpan => {
      const minutes = own.map((slot) => slot.minute);
      return {
        venueServiceId,
        firstAt: Math.min(...minutes),
        lastAt: Math.max(...minutes),
        noTableFits: tables.length > 0 && own.every((slot) => slot.reason === "no_table"),
      };
    });
    return { serviceDate, services };
  });
}
