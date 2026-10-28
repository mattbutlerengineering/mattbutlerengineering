import { judge } from "@mbe/availability";
import type {
  AvailabilitySnapshot,
  BookingSnapshot,
  ResolvedDay,
  Verdict,
} from "@mbe/availability";
import type {
  AvailabilityConfig,
  AvailabilityDaySummary,
  DaySummaryService,
  StrandedReservation,
} from "@mbe/types";

/**
 * Read-side checks of a config save, pure over engine output: which future
 * bookings a change strands, and how a resolved day reads on the calendar.
 */

export interface BookedReservation {
  id: string;
  tableId: string | null;
  startTime: Date;
  partySize: number;
  /** The service date it belongs to; set where a scope needs it. */
  date?: Date;
}

type StrandReason = StrandedReservation["reason"];
const STRANDING: ReadonlySet<string> = new Set<StrandReason>([
  "closed",
  "outside_service",
  "table_blocked",
]);

/** The reason the booking's time is no longer served, or null. Table fit is not re-judged. */
export function strandReason(
  snapshot: AvailabilitySnapshot,
  booking: BookedReservation
): StrandReason | null {
  // No inventory or other bookings: this asks only "is this time still served?",
  // so a conflict (no free table) is never mistaken for a stranding.
  const bare: BookingSnapshot = {
    ...snapshot,
    tables: [],
    reservations: [],
    holds: [],
    settings: null,
  };
  const verdict: Verdict = judge(
    bare,
    {
      start: booking.startTime,
      partySize: booking.partySize,
      channel: "phone",
      ...(booking.tableId ? { tableId: booking.tableId } : {}),
    },
    booking.startTime
  );
  return verdict.kind === "hard" && STRANDING.has(verdict.reason)
    ? (verdict.reason as StrandReason)
    : null;
}

/** Bookings served before the change and not after it. */
export function findStrandedReservations(
  before: AvailabilitySnapshot,
  after: AvailabilitySnapshot,
  bookings: readonly BookedReservation[]
): StrandedReservation[] {
  return bookings.flatMap((booking) => {
    const reason = strandReason(after, booking);
    if (reason === null || strandReason(before, booking) !== null) return [];
    return [
      {
        id: booking.id,
        startTime: booking.startTime.toISOString(),
        partySize: booking.partySize,
        reason,
      },
    ];
  });
}

const WHOLE_DAY_MINUTES = 2880;

function isDayClosed(day: ResolvedDay): boolean {
  const closedAllDay = day.closures.some(
    (c) => c.targetKind === "venue" && c.from <= 0 && c.to >= WHOLE_DAY_MINUTES
  );
  return closedAllDay || day.services.length === 0;
}

function dayLabel(config: AvailabilityConfig, day: ResolvedDay): string {
  if (isDayClosed(day)) return "Closed";
  if (day.explanation.some((l) => l.kind === "special_hours")) return "Special hours";
  return config.schedules.find((s) => s.id === day.scheduleId)?.name ?? "Open";
}

/** Each resolved service's config name, falling back to the day's own (a deleted service). */
function daySummaryServices(
  names: ReadonlyMap<string, string>,
  day: ResolvedDay
): DaySummaryService[] {
  return day.services.map((s) => ({
    venueServiceId: s.venueServiceId,
    name: names.get(s.venueServiceId) ?? s.name,
    opensAt: s.opensAt,
    lastSeatingAt: s.lastSeatingAt,
    closesAt: s.closesAt,
  }));
}

/** A calendar cell: label, closure bands, service count and services (architecture § `GET …/days`). */
export function summarizeDay(config: AvailabilityConfig, day: ResolvedDay): AvailabilityDaySummary {
  const label = dayLabel(config, day);
  const names = new Map(config.venueServices.map((s) => [s.id, s.name]));
  return {
    serviceDate: day.serviceDate,
    label,
    scheduleId: day.scheduleId,
    serviceCount: day.services.length,
    closures: day.closures.map(({ ruleId, targetKind, from, to, bookingTypes }) => ({
      ruleId,
      targetKind,
      from,
      to,
      ...(targetKind === "booking" && bookingTypes ? { bookingTypes } : {}),
    })),
    bookingOpen: day.bookingOpen,
    services: isDayClosed(day) ? [] : daySummaryServices(names, day),
    ...(day.guestMessage ? { guestMessage: day.guestMessage } : {}),
  };
}
