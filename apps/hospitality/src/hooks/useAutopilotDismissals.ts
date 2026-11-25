import { useCallback, useState } from "react";

interface Dismissals {
  readonly night: boolean;
  readonly moves: readonly string[];
  /** Waitlist entries left half-seated: never offered again tonight (#9590). */
  readonly entries: readonly string[];
}

const NONE: Dismissals = { night: false, moves: [], entries: [] };
const storageKey = (venueId: string, date: string) => `mbe-autopilot-dismissed:${venueId}:${date}`;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function read(key: string): Dismissals {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return NONE;
    const parsed = JSON.parse(raw) as Partial<Dismissals>;
    return {
      night: parsed.night === true,
      moves: strings(parsed.moves),
      entries: strings(parsed.entries),
    };
  } catch {
    // Storage blocked or the value is junk: nothing is dismissed.
    return NONE;
  }
}

/** Best effort: false when storage is full or blocked (the dismissal still holds in state). */
function write(key: string, value: Dismissals): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export interface AutopilotDismissals {
  nightDismissed: boolean;
  isMoveDismissed: (moveId: string) => boolean;
  dismissNight: () => void;
  dismissMove: (moveId: string) => void;
  isEntryHeld: (waitlistEntryId: string) => boolean;
  holdEntry: (waitlistEntryId: string) => void;
}

/**
 * What the host has hidden from the Autopilot panel, per venue and service date, so a new
 * night starts fresh. Kept in localStorage (best effort) and in state.
 */
export function useAutopilotDismissals(venueId: string, date: string): AutopilotDismissals {
  const key = storageKey(venueId, date);
  // Re-read when the venue or date changes: state is keyed so a stale night never leaks across.
  const [held, setHeld] = useState<{ key: string; value: Dismissals }>(() => ({
    key,
    value: read(key),
  }));
  const current = held.key === key ? held.value : read(key);

  // Builds from the latest state, not this render's snapshot: a callback captured before an
  // await (an in-flight approval's hold) must not overwrite dismissals made meanwhile.
  const update = useCallback(
    (change: (base: Dismissals) => Dismissals) => {
      setHeld((prev) => {
        const next = change(prev.key === key ? prev.value : read(key));
        write(key, next);
        return { key, value: next };
      });
    },
    [key]
  );

  const add = (list: readonly string[], id: string) => (list.includes(id) ? list : [...list, id]);

  return {
    nightDismissed: current.night,
    isMoveDismissed: (moveId) => current.moves.includes(moveId),
    dismissNight: () => update((base) => ({ ...base, night: true })),
    dismissMove: (moveId) => update((base) => ({ ...base, moves: add(base.moves, moveId) })),
    isEntryHeld: (id) => current.entries.includes(id),
    holdEntry: (id) => update((base) => ({ ...base, entries: add(base.entries, id) })),
  };
}
