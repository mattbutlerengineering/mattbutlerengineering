import { useCallback } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useVenue } from "../../contexts/VenueContext.js";
import { useAvailabilityScope } from "../../hooks/useAvailabilityScope.js";
import { availabilityPath, readAvailabilityAddress } from "./availability-address.js";
import { BookingRulesDrawer } from "./BookingRulesDrawer.js";
import { wasOpenedFromHub } from "./opened-from-hub.js";

/**
 * `availability/booking-rules` (availability-hub ux.md, "Booking rules"): the booking rules
 * drawer over the hub, which renders this as its child. Closing it returns to the hub, with the
 * way back to Venue Setup kept: opened from the hub it goes back to the hub's own entry, so no
 * second one is left; loaded any other way it replaces its own entry with the hub's, so Back does
 * not open it again. Only a Manager edits the rules, so a Host who loads the address lands on the
 * hub. The hub puts focus back on row 5's action (`AvailabilityHubPage`).
 */
export function BookingRulesRoute() {
  const { isManager, rolePending } = useAvailabilityScope();
  const { selectedVenue } = useVenue();
  const navigate = useNavigate();
  const location = useLocation();
  const { from } = readAvailabilityAddress(location);
  const hub = availabilityPath({ view: "hub", ...(from && { from }) });
  const fromHub = wasOpenedFromHub(location.state);
  const close = useCallback(
    () => void (fromHub ? navigate(-1) : navigate(hub, { replace: true })),
    [navigate, hub, fromHub]
  );

  // The drawer reads the stored rules once, when it opens, so it waits for them and for the role.
  if (rolePending || !selectedVenue) return null;
  if (!isManager) return <Navigate to={hub} replace />;
  return <BookingRulesDrawer onClose={close} />;
}

BookingRulesRoute.displayName = "BookingRulesRoute";
