import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useManagerAccess } from "../hooks/useIsManager.js";

interface RequireManagerProps {
  readonly children: ReactNode;
}

/**
 * Route guard for Manager-only pages (floor-plan editors). Non-managers are sent to
 * `/setup`. While the role is still being read it renders nothing, so a Manager is not
 * bounced on a cold load and a Host never sees the editor flash. The UI gate only:
 * the floor-plan API's authorisation is unchanged.
 */
export function RequireManager({ children }: RequireManagerProps) {
  const { isManager, isPending } = useManagerAccess();

  if (isPending) return null;
  if (!isManager) return <Navigate to="/setup" replace />;

  return <>{children}</>;
}

RequireManager.displayName = "RequireManager";
