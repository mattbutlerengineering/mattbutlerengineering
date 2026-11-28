import { localDateTimeOf, serviceDayInstant } from "./instant.js";
import { formatMinute } from "./format-minute.js";
import { resolveDay, type ResolvedClosure, type ResolvedDay } from "./resolve-day.js";
import { filterSuitableTables, pacingRefusal } from "./slot-rules.js";
import {
  closesSeating,
  freeTables,
  seatingMinutes,
  type BookingChannel,
  type BookingSnapshot,
} from "./slots.js";
import type { ServiceDate } from "./types.js";

/**
 * The slot trace: every candidate time the day's services produce, with the first
 * rule that removed it (or `bookable`). It answers the listing path's question
 * (`listSlots` plus the booking window) and agrees with it by construction: the
 * same helpers decide each step, in the same order. Reasons are data, never prose.
 */

/** The booking window a guest is held to, supplied by the caller (it is a venue setting). */
export interface TraceWindow {
  /** Earliest bookable instant (inclusive). */
  earliest: Date;
  /** Last bookable venue-local date, inclusive; null = unbounded. */
  latestLocalDate: string | null;
}

export interface TraceOptions {
  partySize: number;
  now: Date;
  /** Defaults to `online`, the guest-facing listing. */
  channel?: BookingChannel;
  window?: TraceWindow;
}

export type TraceReason =
  | { code: "booking_paused"; channel: BookingChannel }
  | { code: "channel_not_offered"; channel: BookingChannel }
  | (Pick<ResolvedClosure, "ruleId" | "targetKind" | "from" | "to"> & { code: "closure" })
  | { code: "nonexistent_local_time" }
  | { code: "no_suitable_table"; partySize: number }
  | { code: "before_earliest"; earliest: string }
  | { code: "after_latest_date"; latestLocalDate: string }
  | { code: "no_free_table"; suitableTables: number }
  | {
      code: "pacing";
      scope: "venue" | "service";
      limit: number;
      windowMinutes: number;
      covers: number;
      partySize: number;
    };

export interface TracedTime {
  serviceId: string;
  serviceName: string;
  /** Minutes past the service day's midnight; may exceed 1440. */
  minute: number;
  /** Venue-local wall time, en-US (the structured `minute` is the source). */
  time: string;
  /** The instant, ISO 8601; null when the venue clock skips that time. */
  startsAt: string | null;
  outcome: "bookable" | "removed";
  reason?: TraceReason;
}

export interface DayTrace {
  day: ResolvedDay;
  times: TracedTime[];
}

export function traceDay(
  snapshot: BookingSnapshot,
  serviceDate: ServiceDate,
  options: TraceOptions
): DayTrace {
  const { partySize, now, window } = options;
  const channel = options.channel ?? "online";
  const day = resolveDay(snapshot, serviceDate);
  const suitable = filterSuitableTables(snapshot.tables, partySize).length;

  const times = day.services.flatMap((service) =>
    seatingMinutes(service).map((minute): TracedTime => {
      const start = serviceDayInstant(serviceDate, minute, snapshot.timezone);
      const reason = ((): TraceReason | undefined => {
        if (!day.bookingOpen[channel]) return { code: "booking_paused", channel };
        if (!service.bookingTypes.includes(channel)) {
          return { code: "channel_not_offered", channel };
        }
        const band = day.closures.find((b) =>
          closesSeating(b, minute, service.venueServiceId, channel)
        );
        if (band) {
          const { ruleId, targetKind, from, to } = band;
          return { code: "closure", ruleId, targetKind, from, to };
        }
        if (!start) return { code: "nonexistent_local_time" };
        if (suitable === 0) return { code: "no_suitable_table", partySize };
        if (window && start < window.earliest) {
          return { code: "before_earliest", earliest: window.earliest.toISOString() };
        }
        if (
          window?.latestLocalDate != null &&
          localDateTimeOf(start, snapshot.timezone).date > window.latestLocalDate
        ) {
          return { code: "after_latest_date", latestLocalDate: window.latestLocalDate };
        }
        if (freeTables(snapshot, day, minute, partySize, start, now).length === 0) {
          return { code: "no_free_table", suitableTables: suitable };
        }
        const refusal = pacingRefusal(
          start,
          partySize,
          snapshot.settings,
          snapshot.reservations,
          snapshot.holds,
          now,
          day.pacingCovers,
          service.pacing
        );
        return refusal ? { code: "pacing", ...refusal, partySize } : undefined;
      })();
      return {
        serviceId: service.venueServiceId,
        serviceName: service.name,
        minute,
        time: formatMinute(minute),
        startsAt: start ? start.toISOString() : null,
        outcome: reason ? "removed" : "bookable",
        ...(reason ? { reason } : {}),
      };
    })
  );
  return { day, times };
}
