import { useAuth } from "@mbe/auth/react";

/**
 * Reads the `permissions` claim from an access token's payload, or `undefined`
 * when the token is absent or not a decodable JWT. Decoded, not verified: this
 * only gates what the UI shows — the server verifies the same token and is the
 * real authority.
 */
function accessTokenPermissions(accessToken: string | null): unknown {
  const payload = accessToken?.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { permissions?: unknown }).permissions;
  } catch {
    return undefined;
  }
}

function includesAdmin(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.includes("admin");
}

/**
 * True when the authenticated user carries the platform `admin` permission.
 *
 * Mirrors the backend's `hasPermission(user, "admin")` (ADR-020): the coarse
 * role lives in the JWT `permissions` claim. Auth0 RBAC puts that claim in the
 * ACCESS token only — the ID-token profile (`user.raw`) never carries it — so
 * the access token is read first, the same token the server checks (#6335).
 * Single source of truth for admin-only UI — the Admin nav section, the /admin
 * route guard, the system-health badge, and the staff cancellation quote all
 * read this so a non-admin never sees admin surfaces (#3069).
 */
export function useIsAdmin(): boolean {
  const { user, accessToken } = useAuth();
  return (
    includesAdmin(accessTokenPermissions(accessToken)) || includesAdmin(user?.raw?.permissions)
  );
}
