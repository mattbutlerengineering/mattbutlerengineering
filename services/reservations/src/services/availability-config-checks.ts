import { judge } from "@mbe/availability";
import type {
  AvailabilitySnapshot,
  BookingSnapshot,
  ResolvedDay,
  Verdict,
} from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityDaySummary, StrandedReservation } from "@mbe/types";

/**
 * Read-side checks of a config save, pure over engine output: which future
 * bookings a change strands, and how a resolved day reads on the calendar.
 */

export interface BookedReservation {
  id: string;
  tableId: string | null;
  startTime: Date;
  partySize: number;
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

function dayLabel(config: AvailabilityConfig, day: ResolvedDay): string {
  const closedAllDay = day.closures.some(
    (c) => c.targetKind === "venue" && c.from <= 0 && c.to >= WHOLE_DAY_MINUTES
  );
  if (closedAllDay || day.services.length === 0) return "Closed";
  if (day.explanation.some((l) => l.kind === "special_hours")) return "Special hours";
  return config.schedules.find((s) => s.id === day.scheduleId)?.name ?? "Open";
}

/** A calendar cell: label, closure bands and service count (architecture § `GET …/days`). */
export function summarizeDay(config: AvailabilityConfig, day: ResolvedDay): AvailabilityDaySummary {
  return {
    serviceDate: day.serviceDate,
    label: dayLabel(config, day),
    scheduleId: day.scheduleId,
    serviceCount: day.services.length,
    closures: day.closures.map(({ ruleId, targetKind, from, to }) => ({
      ruleId,
      targetKind,
      from,
      to,
    })),
    bookingOpen: day.bookingOpen,
    ...(day.guestMessage ? { guestMessage: day.guestMessage } : {}),
  };
}
