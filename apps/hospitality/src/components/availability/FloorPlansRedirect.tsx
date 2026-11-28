import { Navigate, useLocation, useParams } from "react-router";
import { availabilityPath } from "./availability-address.js";

/**
 * `/floor-plans` and `/floor-plans/:id`, the old floor plan addresses: the plans moved under
 * Availability as "Where guests sit" (#9944 S3). A replace, so Back does not come back to the
 * redirect; the query rides along, since the editor reads some of it.
 */
export function FloorPlansRedirect() {
  const { id } = useParams();
  const { search } = useLocation();
  const to = availabilityPath({ view: "floorPlans", ...(id && { floorPlanId: id }) });
  return <Navigate to={`${to}${search}`} replace />;
}
