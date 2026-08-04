import type { FastifyRequest, FastifyReply } from "fastify";
import { createProblemDetails, titleForStatus } from "@mbe/types";
import { hasPermission } from "./plugin.js";

/**
 * Hybrid role/venue authorization guards (ADR-020).
 *
 * The convention is deliberately split across two mechanisms:
 *   - Coarse ROLE lives in the JWT (Auth0 `permissions` RBAC claim). It is read
 *     STATELESSLY from `request.user` — no per-request I/O. `requireAdmin`
 *     enforces the platform-admin role.
 *   - Fine-grained VENUE MEMBERSHIP lives server-side in a per-service table
 *     keyed to the Auth0 `sub`. `requireVenueAccess` queries it per request so a
 *     revoked staffer loses access immediately, not at token refresh.
 *
 * Both guards assume `requireAuth` ran first (so `request.user` is set).
 */

/**
 * PreHandler enforcing the platform-admin coarse role.
 *
 * Reads the role statelessly from the JWT via `hasPermission(user, "admin")`
 * — the same admin notion used by `requireOwnershipOrAdmin`. Booking-widget
 * guest JWTs carry no operator permission, so they are rejected here.
 *
 * Assumes `requireAuth` ran first (request.user is guaranteed set).
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!hasPermission(request.user, "admin")) {
    reply.code(403).send(createProblemDetails(403, titleForStatus(403), "Admin role required"));
  }
}

/**
 * Resolves the target venue id for a request. Returns null when the venue
 * cannot be determined (e.g. the addressed resource does not exist); null
 * yields a 403 so resource existence is never leaked to non-members.
 */
export type VenueIdResolver = (
  request: FastifyRequest
) => string | null | undefined | Promise<string | null | undefined>;

/**
 * Injected membership lookup. Resolves whether the given Auth0 `sub` is a
 * member of the given venue. The shared auth package cannot own a service's
 * PrismaClient, so consuming services inject their own DB-backed lookup.
 */
export type VenueMembershipLookup = (userSub: string, venueId: string) => Promise<boolean>;

/**
 * PreHandler factory for venue-scoped staff routes.
 *
 * Decision matrix (assumes `requireAuth` ran first):
 *   - request.user missing → 401 (identity unresolvable)
 *   - platform admin (coarse role) → allow, skip venue resolution + lookup
 *   - resolveVenueId returns null/undefined → 403 (venue undeterminable)
 *   - membership lookup true → allow
 *   - membership lookup false → 403
 *
 * Instant revocation: a removed membership row denies access on the very next
 * request, without waiting for the JWT to be re-issued.
 *
 * @param lookupMembership - Injected `(sub, venueId) => Promise<boolean>`.
 * @param resolveVenueId - Extracts the target venue id from the request.
 */
export function requireVenueAccess(
  lookupMembership: VenueMembershipLookup,
  resolveVenueId: VenueIdResolver
) {
  return async function venueAccessHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = request.user;

    if (!user) {
      reply
        .code(401)
        .send(createProblemDetails(401, titleForStatus(401), "Authentication required"));
      return;
    }

    // Platform admins are scoped to every venue; skip the per-request lookup.
    if (hasPermission(user, "admin")) {
      return;
    }

    const venueId = await resolveVenueId(request);
    if (!venueId) {
      reply
        .code(403)
        .send(
          createProblemDetails(403, titleForStatus(403), "You do not have access to this venue")
        );
      return;
    }

    const isMember = await lookupMembership(user.raw.sub, venueId);
    if (!isMember) {
      reply
        .code(403)
        .send(
          createProblemDetails(403, titleForStatus(403), "You do not have access to this venue")
        );
      return;
    }
  };
}
