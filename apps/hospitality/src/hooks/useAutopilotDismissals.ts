import { useCallback, useState } from "react";

interface Dismissals {
  readonly night: boolean;
  readonly moves: readonly string[];
}

const NONE: Dismissals = { night: false, moves: [] };
const storageKey = (venueId: string, date: string) => `mbe-autopilot-dismissed:${venueId}:${date}`;

function read(key: string): Dismissals {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return NONE;
    const parsed = JSON.parse(raw) as Partial<Dismissals>;
    return {
      night: parsed.night === true,
      moves: Array.isArray(parsed.moves) ? parsed.moves.filter((m) => typeof m === "string") : [],
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

  const update = useCallback(
    (next: Dismissals) => {
      write(key, next);
      setHeld({ key, value: next });
    },
    [key]
  );

  return {
    nightDismissed: current.night,
    isMoveDismissed: (moveId) => current.moves.includes(moveId),
    dismissNight: () => update({ ...current, night: true }),
    dismissMove: (moveId) =>
      current.moves.includes(moveId)
        ? undefined
        : update({ ...current, moves: [...current.moves, moveId] }),
  };
}
