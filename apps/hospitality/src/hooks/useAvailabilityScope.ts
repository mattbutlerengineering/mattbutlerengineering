import { useOutletContext } from "react-router";
import type { AvailabilityConfigSaveResult, AvailabilityConfigState } from "@mbe/types";

export type AvailabilityLoad = "loading" | "error" | "ready";

/** Where a config read stands. A refetch failing over a config on hand leaves it `ready`. */
export function availabilityLoad(
  state: Pick<AvailabilityConfigState, "source"> | null,
  failed: boolean
): AvailabilityLoad {
  if (state === null) return failed ? "error" : "loading";
  return state.source === "unreadable" ? "error" : "ready";
}

/** What every Availability child route is given (availability-hub architecture.md "Layout context"). */
export interface AvailabilityScope {
  /** `null` when no venue is selected. */
  readonly venueId: string | null;
  /** The venue's IANA time zone; empty when no venue is selected. */
  readonly timezone: string;
  /** Today's date in the venue's time zone. */
  readonly today: string;
  /** The config, its version and its source; `null` until the config has loaded. */
  readonly state: AvailabilityConfigState | null;
  /**
   * Where the config read stands, which `state` alone cannot say: `loading` until it first
   * answers, `error` when it has never answered or answered with hours nobody can read
   * (`source: "unreadable"`), else `ready`. `refresh()` is the retry.
   */
  readonly load: AvailabilityLoad;
  /** Why the read failed, as a sentence; `null` unless a request failed with no config on hand. */
  readonly loadError: string | null;
  /** False for a Host, and while the role is still being read. */
  readonly isManager: boolean;
  /** The role is still being read, so `isManager: false` does not yet mean a Host. */
  readonly rolePending: boolean;
  /** Refetches the config, after a refused save. */
  readonly refresh: () => void;
  /**
   * Shows the 10-second Undo for a save, under `title`. The layout owns the offer, so it still
   * works after the child that saved has unmounted.
   */
  readonly offerUndo: (title: string, saved: AvailabilityConfigSaveResult) => void;
}

/** The scope `AvailabilityLayout` provides, for a child route of `availability`. */
export function useAvailabilityScope(): AvailabilityScope {
  return useOutletContext<AvailabilityScope>();
}
