import { venueDate } from "./service-day.js";

/**
 * Client mirror of the server's `canSignal` (services/reservations/src/services/can-signal.ts).
 * The server is authoritative and still refuses out-of-rule signals; the page only uses this to
 * disable the buttons ahead of time. `guest-signal.test.ts` pins the same boundaries.
 */
export const MAX_LATE_SIGNALS = 3;
export const MAX_ARRIVED_SIGNALS = 1;
const SIGNAL_WINDOW_BEFORE_MS = 3 * 60 * 60 * 1000;
const SIGNAL_WINDOW_AFTER_MS = 45 * 60 * 1000;

export interface GuestSignalAvailabilityInput {
  status: string;
  /** Reservation start instant (ISO string). */
  startTime: string;
  /** Venue IANA timezone; "today" is decided in it. */
  timezone: string;
  now: Date;
  priorSignals: { late: number; arrived: number };
}

export interface GuestSignalAvailability {
  readonly lateAllowed: boolean;
  readonly arrivedAllowed: boolean;
  /** Why neither can be sent (a cap only disables its own button); null when the booking and clock allow signals. */
  readonly reason: "not-confirmed" | "outside-window" | null;
}

export function guestSignalAvailability(
  input: GuestSignalAvailabilityInput
): GuestSignalAvailability {
  if (input.status !== "CONFIRMED") {
    return { lateAllowed: false, arrivedAllowed: false, reason: "not-confirmed" };
  }
  const start = new Date(input.startTime);
  const delta = input.now.getTime() - start.getTime();
  const inWindow =
    delta >= -SIGNAL_WINDOW_BEFORE_MS &&
    delta <= SIGNAL_WINDOW_AFTER_MS &&
    venueDate(input.now, input.timezone) === venueDate(start, input.timezone);
  if (!inWindow) return { lateAllowed: false, arrivedAllowed: false, reason: "outside-window" };
  return {
    lateAllowed: input.priorSignals.late < MAX_LATE_SIGNALS,
    arrivedAllowed: input.priorSignals.arrived < MAX_ARRIVED_SIGNALS,
    reason: null,
  };
}
