import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { dialogSearch, type CloseTarget } from "../components/availability/availability-address.js";
import type { AvailabilityScope, CloseOpening } from "./useAvailabilityScope.js";

/**
 * A Close the layout opened for a child, at the search it pushed. It carries the child's
 * `onSaved`, and the target as given, so a selection of more dates than an address holds (20)
 * still opens on all of them and the dialog's own check refuses it, as it always has.
 */
export interface OpenedClose extends CloseOpening {
  readonly search: string;
  readonly target: CloseTarget;
}

/** Set in the history entry `openClose` and `openPause` push, so leaving can go back to it. */
const PUSHED = "availabilityDialog";

const pushedBy = (state: unknown): boolean =>
  typeof state === "object" && state !== null && PUSHED in state;

const withPushed = (state: unknown): Record<string, unknown> => ({
  ...(typeof state === "object" && state !== null ? state : {}),
  [PUSHED]: true,
});

export interface AvailabilityDialogs extends Pick<AvailabilityScope, "openClose" | "openPause"> {
  /** The Close a child opened, while the address still names it; else `null`. */
  readonly opened: OpenedClose | null;
  /**
   * Leaves the dialog: back one entry when this layout pushed it, so Back then leaves the view and
   * no second copy of it is left; otherwise (loaded by its address) the param goes with a replace.
   */
  readonly leave: () => void;
}

/**
 * The layout's side of the Close and Pause host (architecture.md "Layout Close and Pause host"):
 * `openClose` and `openPause` set the param with a push. Each keeps one identity for the life of
 * the layout, as `offerUndo` does, so the scope only changes when one of its values does.
 */
export function useAvailabilityDialogs(): AvailabilityDialogs {
  const navigate = useNavigate();
  const location = useLocation();
  const latest = useRef({ navigate, location });
  useEffect(() => {
    latest.current = { navigate, location };
  });
  const [opened, setOpened] = useState<OpenedClose | null>(null);

  const push = useCallback((dialog: Parameters<typeof dialogSearch>[1]): string => {
    const { navigate: go, location: here } = latest.current;
    const search = dialogSearch(here.search, dialog);
    void go({ search }, { state: withPushed(here.state) });
    return search;
  }, []);
  const openClose = useCallback<AvailabilityScope["openClose"]>(
    (target, opening = {}) => setOpened({ ...opening, target, search: push({ close: target }) }),
    [push]
  );
  const openPause = useCallback(() => {
    setOpened(null);
    push({ pause: true });
  }, [push]);
  const leave = useCallback(() => {
    const { navigate: go, location: here } = latest.current;
    setOpened(null);
    if (pushedBy(here.state)) void go(-1);
    else void go({ search: dialogSearch(here.search, null) }, { replace: true, state: here.state });
  }, []);

  return {
    openClose,
    openPause,
    leave,
    opened: opened?.search === location.search ? opened : null,
  };
}
