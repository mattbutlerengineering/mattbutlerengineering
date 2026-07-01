import { hasPermission } from "@mbe/auth/fastify";
import type { AuthUser } from "@mbe/auth/fastify";

/**
 * Returns true if the caller is the session owner or an admin.
 * Sessions with null userId are admin-only (no owner to match).
 * Callers should return 404 (not 403) on false, to avoid revealing existence.
 */
export function isOwnerOrAdmin(
  caller: AuthUser | undefined,
  sessionUserId: string | null
): boolean {
  if (hasPermission(caller, "admin")) return true;
  if (sessionUserId === null) return false;
  return caller?.id === sessionUserId;
}
