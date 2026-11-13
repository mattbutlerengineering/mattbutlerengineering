import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAvailabilityScope } from "../../hooks/useAvailabilityScope.js";
import { availabilityPath, readAvailabilityAddress } from "./availability-address.js";
import { AvailabilityHistoryDrawer } from "./AvailabilityHistoryDrawer.js";
import { wasOpenedFromHub } from "./opened-from-hub.js";

/**
 * `availability/history` (availability-hub ux.md, "History"): the History drawer over the hub,
 * which renders this as its child. A Host reads it too, without Undo. Closing it returns to the
 * hub, with the way back to Venue Setup kept: opened from the hub it goes back to the hub's own
 * entry; loaded any other way it replaces its own entry with the hub's, so Back does not open it
 * again. View day replaces the drawer's entry with the calendar on that date, for the same
 * reason. The hub puts focus back on its History link (`AvailabilityHubPage`).
 */
export function AvailabilityHistoryRoute() {
  const { venueId, isManager, rolePending } = useAvailabilityScope();
  const navigate = useNavigate();
  const location = useLocation();
  const { from } = readAvailabilityAddress(location);
  const hub = availabilityPath({ view: "hub", ...(from && { from }) });
  const fromHub = wasOpenedFromHub(location.state);
  const close = useCallback(
    () => void (fromHub ? navigate(-1) : navigate(hub, { replace: true })),
    [navigate, hub, fromHub]
  );
  const openDay = useCallback(
    (date: string) =>
      void navigate(availabilityPath({ view: "calendar", date, ...(from && { from }) }), {
        replace: true,
      }),
    [navigate, from]
  );

  if (!venueId) return null;
  return (
    <AvailabilityHistoryDrawer
      open
      venueId={venueId}
      // `undefined` while the role is read, so Undo is not offered before it is known.
      viewerRole={rolePending ? undefined : isManager ? "manager" : "host"}
      onClose={close}
      onOpenDay={openDay}
    />
  );
}

AvailabilityHistoryRoute.displayName = "AvailabilityHistoryRoute";
