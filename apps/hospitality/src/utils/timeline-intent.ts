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
