/**
 * Pure rule for the guest night-of signals ("running late" / "arrived").
 * Signals are information only: they never change the booking.
 */

export const MAX_LATE_SIGNALS = 3;
export const MAX_ARRIVED_SIGNALS = 1;
export const SIGNAL_WINDOW_BEFORE_MS = 3 * 60 * 60 * 1000;
export const SIGNAL_WINDOW_AFTER_MS = 45 * 60 * 1000;

export type GuestSignalKind = "running-late" | "arrived";

export type CanSignalResult =
  { ok: true } | { ok: false; reason: "not-confirmed" | "outside-window" | "cap-reached" };

export interface CanSignalInput {
  status: string;
  /** Reservation start instant (ISO string). */
  startTime: string;
  /** Venue IANA timezone; "today" is decided in it. */
  timezone: string;
  now: Date;
  kind: GuestSignalKind;
  priorSignals: { late: number; arrived: number };
}

function localDay(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function canSignal(input: CanSignalInput): CanSignalResult {
  if (input.status !== "CONFIRMED") return { ok: false, reason: "not-confirmed" };

  const start = new Date(input.startTime);
  const delta = input.now.getTime() - start.getTime();
  const inWindow = delta >= -SIGNAL_WINDOW_BEFORE_MS && delta <= SIGNAL_WINDOW_AFTER_MS;
  if (!inWindow || localDay(input.now, input.timezone) !== localDay(start, input.timezone)) {
    return { ok: false, reason: "outside-window" };
  }

  const capped =
    input.kind === "arrived"
      ? input.priorSignals.arrived >= MAX_ARRIVED_SIGNALS
      : input.priorSignals.late >= MAX_LATE_SIGNALS;
  return capped ? { ok: false, reason: "cap-reached" } : { ok: true };
}
