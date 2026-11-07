import { useVenue } from "../contexts/VenueContext.js";
import { useVenueTeam } from "./useVenueTeam.js";

export interface ManagerAccess {
  readonly isManager: boolean;
  /** True while the venue list or the team read has not answered yet, so the role is unknown. */
  readonly isPending: boolean;
}

/**
 * The viewer's Manager role at the selected venue, plus whether it is still being read.
 * Route guards use `isPending` to wait instead of redirecting a Manager on a cold load.
 * A failed read settles as a non-manager (fail closed).
 */
export function useManagerAccess(): ManagerAccess {
  const { selectedVenueId, isLoading: venueLoading } = useVenue();
  const team = useVenueTeam({ venueId: selectedVenueId });
  return {
    isManager: team.data?.viewerRole === "manager",
    isPending: venueLoading || team.isLoading,
  };
}

/**
 * True when the viewer is a Manager at the selected venue. False while the team read
 * loads and when it fails, so nothing editable flashes for a Host. This is a UI gate,
 * not an authorization boundary: the API authorises writes itself.
 */
export function useIsManager(): boolean {
  return useManagerAccess().isManager;
}
