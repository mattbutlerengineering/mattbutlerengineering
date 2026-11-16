import { Navigate } from "react-router";
import { availabilityPath } from "./availability-address.js";

/**
 * `/setup`, the old Venue Setup address: Venue Setup became the Availability map, a page of the
 * Availability hub (#8864). It lands with a replace, so Back does not come back to the redirect.
 */
export function SetupRedirect() {
  return <Navigate to={availabilityPath({ view: "map" })} replace />;
}
