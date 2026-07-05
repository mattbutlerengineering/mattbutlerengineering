import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "../hooks/useIsAdmin.js";

interface RequireAdminProps {
  readonly children: ReactNode;
}

/**
 * Route guard for admin-only pages (#3069). Non-admins are redirected to the
 * dashboard so a hand-typed `/admin` URL cannot reach the Users panel — the
 * nav gate alone (hiding the link) is not an authorization boundary.
 */
export function RequireAdmin({ children }: RequireAdminProps) {
  const isAdmin = useIsAdmin();

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

RequireAdmin.displayName = "RequireAdmin";
