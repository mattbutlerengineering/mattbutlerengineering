import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { LoadingPage } from "../pages/LoadingPage.js";
import { useManagerAccess } from "../hooks/useIsManager.js";
import { availabilityPath } from "./availability/availability-address.js";

interface RequireManagerProps {
  readonly children: ReactNode;
  /** Where a non-manager is sent. Defaults to the Availability map. */
  readonly redirectTo?: string;
}

const MAP = availabilityPath({ view: "map" });

/**
 * Route guard for Manager-only pages (floor-plan editors). Non-managers are sent to
 * `redirectTo`, the Availability map unless the route names another. While the role is still being read it shows the route loading page, so a Manager is not
 * bounced on a cold load and a Host never sees the editor flash. The UI gate only:
 * the floor-plan API's authorisation is unchanged.
 */
export function RequireManager({ children, redirectTo = MAP }: RequireManagerProps) {
  const { isManager, isPending } = useManagerAccess();

  if (isPending) return <LoadingPage />;
  if (!isManager) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}

RequireManager.displayName = "RequireManager";
