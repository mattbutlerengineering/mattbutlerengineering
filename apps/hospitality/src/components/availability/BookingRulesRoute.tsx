import { useCallback } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useVenue } from "../../contexts/VenueContext.js";
import { useAvailabilityScope } from "../../hooks/useAvailabilityScope.js";
import { availabilityPath, readAvailabilityAddress } from "./availability-address.js";
import { BookingRulesDrawer } from "./BookingRulesDrawer.js";

/**
 * `availability/booking-rules` (availability-hub ux.md, "Booking rules"): the booking rules
 * drawer over the hub, which renders this as its child. Closing it goes to the hub, with the way
 * back to Venue Setup kept. Only a Manager edits the rules, so a Host who loads the address lands
 * on the hub.
 */
export function BookingRulesRoute() {
  const { isManager, rolePending } = useAvailabilityScope();
  const { selectedVenue } = useVenue();
  const navigate = useNavigate();
  const { from } = readAvailabilityAddress(useLocation());
  const hub = availabilityPath({ view: "hub", ...(from && { from }) });
  // A replace: once closed, Back does not open the drawer again.
  const close = useCallback(() => void navigate(hub, { replace: true }), [navigate, hub]);

  // The drawer reads the stored rules once, when it opens, so it waits for them and for the role.
  if (rolePending || !selectedVenue) return null;
  if (!isManager) return <Navigate to={hub} replace />;
  return <BookingRulesDrawer onClose={close} />;
}

BookingRulesRoute.displayName = "BookingRulesRoute";
