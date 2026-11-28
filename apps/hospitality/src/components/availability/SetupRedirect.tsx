import { Navigate } from "react-router";
import { availabilityPath } from "./availability-address.js";

/**
 * `/setup`, the old Venue Setup address: Venue Setup became the Availability map (#8864), which
 * is retired into the hub (#10032). It lands with a replace, so Back does not come back to the
 * redirect.
 */
export function SetupRedirect() {
  return <Navigate to={availabilityPath({ view: "map" })} replace />;
}
