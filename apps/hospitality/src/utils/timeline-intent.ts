/**
 * The Timeline's URL intent contract (architecture § Interfaces & contracts).
 *
 * Producers (⌘K "Walk-in guest", the Dashboard "Walk-in" button, Waitlist and Reservations
 * hand-offs) write `walkin=true` or `selected=<id>`; the Timeline reads the intent once on
 * arrival, acts on it, and strips both keys so a reload or Back does not replay it.
 */

export const WALK_IN_PARAM = "walkin";
export const SELECTED_PARAM = "selected";

export interface TimelineIntent {
  /** Exactly `walkin=true` — any other spelling is no intent. */
  readonly walkIn: boolean;
  /** `selected=<id>`, trimmed; blank or absent is `null`. */
  readonly selectedId: string | null;
}

export function parseTimelineIntent(params: URLSearchParams): TimelineIntent {
  const selected = params.get(SELECTED_PARAM)?.trim() ?? "";
  return {
    walkIn: params.get(WALK_IN_PARAM) === "true",
    selectedId: selected === "" ? null : selected,
  };
}

/** A new `URLSearchParams` with both intent keys removed; every other key (e.g. `date`) is kept. */
export function stripTimelineIntent(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(WALK_IN_PARAM);
  next.delete(SELECTED_PARAM);
  return next;
}

/*
 * The Reservations page's URL intent (architecture § Amendment 2026-09-04). Same shape as the
 * Timeline's: ⌘K "New Reservation" writes `new=true`; the page opens its dialog on arrival and
 * strips the key so Back or a reload does not replay it.
 */

export const NEW_RESERVATION_PARAM = "new";

export interface ReservationsIntent {
  /** Exactly `new=true` — any other spelling is no intent. */
  readonly newReservation: boolean;
}

export function parseReservationsIntent(params: URLSearchParams): ReservationsIntent {
  return { newReservation: params.get(NEW_RESERVATION_PARAM) === "true" };
}

/** A new `URLSearchParams` without `new`; every other key (`date`, `status`, …) is kept. */
export function stripReservationsIntent(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(NEW_RESERVATION_PARAM);
  return next;
}
