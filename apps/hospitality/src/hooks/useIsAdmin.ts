import { useAuth } from "@mbe/auth/react";

/**
 * True when the authenticated user carries the platform `admin` permission.
 *
 * Mirrors the backend's `hasPermission(user, "admin")` (ADR-020): the coarse
 * role lives in the JWT `permissions` claim. Single source of truth for
 * admin-only UI — the Admin nav section, the /admin route guard, and the
 * system-health badge all read this so a non-admin never sees admin surfaces (#3069).
 */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const permissions = user?.raw?.permissions;
  return Array.isArray(permissions) && permissions.includes("admin");
}
