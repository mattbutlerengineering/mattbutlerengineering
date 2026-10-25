import { resolveDay, type BookingSnapshot, type ServiceDate } from "@mbe/availability";
import type { AvailabilityClosure, BookingPaused } from "@mbe/types";

/**
 * What a guest is told about a date beyond its slots (docs/features/
 * venue-availability/ux.md F9): a closure message for a closed date, or the
 * "online booking paused" notice while a pause-until-reopened is in force.
 * Pure: reads the snapshot the slots were listed from.
 */

export const DEFAULT_CLOSURE_MESSAGE = "Closed on this date.";
export const PAUSED_CALL_MESSAGE = "Online booking is paused right now.";
export const PAUSED_MESSAGE = "Not taking reservations right now.";

export interface DayNotices {
  closure?: AvailabilityClosure;
  bookingPaused?: BookingPaused;
}

/** "Pause online booking until I reopen": an open-ended, whole-day closure of online booking. */
function activePause(snapshot: BookingSnapshot, day: ReturnType<typeof resolveDay>) {
  const pausedRuleIds = new Set(
    day.closures
      .filter((band) => band.targetKind === "booking" && band.bookingTypes?.includes("online"))
      .map((band) => band.ruleId)
  );
  return snapshot.config.dateRules.find(
    (rule) =>
      pausedRuleIds.has(rule.id) && rule.kind === "closure" && rule.endsOn == null && !rule.window
  );
}

export function dayNotices(
  snapshot: BookingSnapshot,
  serviceDate: ServiceDate,
  phone: string | null,
  /** Online seatings `listSlots` found for the date, booked or not. */
  seatingCount: number
): DayNotices {
  const day = resolveDay(snapshot, serviceDate);
  const pause = activePause(snapshot, day);
  if (pause) {
    const phoneOpen =
      day.bookingOpen.phone && day.services.some((s) => s.bookingTypes.includes("phone"));
    const callable = phoneOpen && phone ? phone : undefined;
    const fallback = callable ? PAUSED_CALL_MESSAGE : PAUSED_MESSAGE;
    return {
      bookingPaused: {
        message: pause.guestMessage ?? fallback,
        ...(callable ? { phone: callable } : {}),
      },
    };
  }
  const closedByRule = day.closures.some((band) => band.targetKind !== "tables");
  if (!closedByRule) return {};
  // Any seating left on the online channel means the date is open, if shorter.
  if (seatingCount > 0) return {};
  return { closure: { message: day.guestMessage ?? DEFAULT_CLOSURE_MESSAGE } };
}
