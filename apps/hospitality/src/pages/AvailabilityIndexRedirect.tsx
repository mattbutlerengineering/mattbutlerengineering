import { Navigate, useLocation } from "react-router";
import { indexRedirect } from "../components/availability/availability-address.js";

/**
 * The index of `availability` until the hub page takes it (availability-hub breakdown H1.6): it
 * sends every visit to today's page, an old address to the tab it named. A replace, so Back does
 * not loop.
 */
export function AvailabilityIndexRedirect() {
  const { search } = useLocation();
  return <Navigate to={indexRedirect(search)} replace />;
}

AvailabilityIndexRedirect.displayName = "AvailabilityIndexRedirect";
