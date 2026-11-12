import { useOutletContext } from "react-router";
import type { AvailabilityConfigSaveResult, AvailabilityConfigState } from "@mbe/types";

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
  /** False for a Host, and while the role is still being read. */
  readonly isManager: boolean;
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
