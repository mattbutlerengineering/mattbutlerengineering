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
 * Injected "does this user hold ANY venue membership" lookup, used by
 * `requireVenueCreateAccess` to recognise the bootstrap case.
 *
 * Contract, and the reason it is spelled out: a rejected promise MUST be
 * allowed to propagate. It must never be caught and coerced to `false`.
 * `false` means "no memberships, admit the bootstrap", so swallowing a
 * database outage here would grant every authenticated identity permission to
 * create venues — fail-open on the one path where that is worst.
 */
export type HasAnyVenueMembership = (userSub: string) => Promise<boolean>;

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

/**
 * A member's per-venue role. Mirrors the reservations schema's `VenueRole`
 * enum; the PRD's actors map onto it as owner/manager → Manager and
 * staff → Host (docs/features/venue-availability/architecture.md).
 */
export type VenueRole = "owner" | "manager" | "staff";

/** Higher rank includes every lower one: owner ⊇ manager ⊇ staff. */
const VENUE_ROLE_RANK: Readonly<Record<VenueRole, number>> = {
  staff: 0,
  manager: 1,
  owner: 2,
};

/** True when `role` meets or exceeds `minimum`. A non-member (`null`) never does. */
export function hasVenueRole(role: VenueRole | null, minimum: VenueRole): boolean {
  return role !== null && VENUE_ROLE_RANK[role] >= VENUE_ROLE_RANK[minimum];
}

/**
 * Injected role lookup: the caller's role in the venue, or `null` when they
 * hold no membership. A rejection must propagate (it fails the request closed).
 */
export type VenueRoleLookup = (userSub: string, venueId: string) => Promise<VenueRole | null>;

/**
 * PreHandler factory for venue-scoped routes that need a minimum venue role
 * (e.g. `requireVenueRole("manager", ...)` for configuration writes).
 *
 * Same decision order as `requireVenueAccess`, with the role check last:
 *   - request.user missing → 401
 *   - platform admin → allow, skip venue resolution + lookup
 *   - venue undeterminable or caller not a member → 403 (same detail as
 *     `requireVenueAccess`, so existence never leaks)
 *   - member below `minimum` → 403 naming the required role
 */
export function requireVenueRole(
  minimum: VenueRole,
  lookupRole: VenueRoleLookup,
  resolveVenueId: VenueIdResolver
) {
  const roleDetail = `${minimum.charAt(0).toUpperCase()}${minimum.slice(1)} role required for this venue`;

  return async function venueRoleHandler(
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

    if (hasPermission(user, "admin")) {
      return;
    }

    const venueId = await resolveVenueId(request);
    const role = venueId ? await lookupRole(user.raw.sub, venueId) : null;

    if (role === null) {
      reply
        .code(403)
        .send(
          createProblemDetails(403, titleForStatus(403), "You do not have access to this venue")
        );
      return;
    }

    if (!hasVenueRole(role, minimum)) {
      reply.code(403).send(createProblemDetails(403, titleForStatus(403), roleDetail));
    }
  };
}

/**
 * PreHandler factory for venue CREATION (ADR-020, third case).
 *
 * Venue creation is privileged, with exactly one exception: an authenticated
 * identity that holds no venue membership at all is creating its first venue,
 * which is the act of becoming a customer rather than a privileged operation.
 * Every other venue write stays admin-gated.
 *
 * Decision order (assumes `requireAuth` ran first) — the order is load-bearing:
 *   - request.user missing → 401 (identity unresolvable)
 *   - platform admin → allow, WITHOUT the membership query (no I/O for admins)
 *   - lookup true (already holds a venue) → 403
 *   - lookup false → allow (bootstrap)
 *
 * The caller's `sub` is read from the verified JWT only. Nothing from the body,
 * query, or headers participates, so a forged identifier cannot flip the
 * outcome.
 *
 * This guard is a cheap early refusal, NOT the authority: two concurrent
 * requests from one identity can both observe zero memberships here. The
 * invariant is enforced inside the venue-creation transaction, which owns the
 * data that proves it.
 *
 * @param hasAnyVenueMembership - Injected `(sub) => Promise<boolean>`. A
 *   rejection propagates (500) and is never treated as "no memberships".
 */
export function requireVenueCreateAccess(hasAnyVenueMembership: HasAnyVenueMembership) {
  return async function venueCreateAccessHandler(
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

    // Platform admins may create any venue; skip the per-request lookup.
    if (hasPermission(user, "admin")) {
      return;
    }

    // Deliberately unguarded: a rejection propagates to the error handler.
    // See HasAnyVenueMembership's contract for why this must not be caught.
    const alreadyHasVenue = await hasAnyVenueMembership(user.raw.sub);

    if (alreadyHasVenue) {
      reply
        .code(403)
        .send(
          createProblemDetails(
            403,
            titleForStatus(403),
            "Admin role required to create additional venues"
          )
        );
    }
  };
}
