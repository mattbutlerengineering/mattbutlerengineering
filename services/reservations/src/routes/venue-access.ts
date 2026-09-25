import type { FastifyRequest } from "fastify";
import type { VenueIdResolver } from "@mbe/auth/fastify";
import { resolveVenueId, type EntityKind } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

/**
 * Venue-id resolvers for `requireVenueAccess` (ADR-020). The staff routes name
 * the tenant key `venueId` consistently across query, body, and params; these
 * helpers extract it defensively (schema validation has already run, but the
 * resolver never assumes a shape it hasn't checked).
 */

/** Reads `venueId` from the query string (staff list/search routes). */
export const venueIdFromQuery: VenueIdResolver = (request) => {
  const query = request.query as { venueId?: unknown } | null | undefined;
  return typeof query?.venueId === "string" ? query.venueId : null;
};

/** Reads `venueId` from the request body (staff create routes). */
export const venueIdFromBody: VenueIdResolver = (request) => {
  const body = request.body as { venueId?: unknown } | null | undefined;
  return typeof body?.venueId === "string" ? body.venueId : null;
};

/** Reads `venueId` from a route param (routes addressed by `:venueId`). */
export const venueIdFromParams: VenueIdResolver = (request) => {
  const params = request.params as { venueId?: unknown } | null | undefined;
  return typeof params?.venueId === "string" ? params.venueId : null;
};

/**
 * Builds a `VenueIdResolver` for routes addressed by an entity other than the
 * venue itself (e.g. a table, floor plan, or guest id), scoping the action to
 * that entity's owning venue.
 *
 * `getKey` extracts the lookup key from the request (a param or body field).
 * `kind` names the entity in `resolveVenueId`'s allowlist (ADR-026 §3.3 item 2
 * / #5369 PR 5) — this resolves the owning venue through the `SECURITY
 * DEFINER` `app_resolve_venue_id` function rather than loading the entity
 * through the venue-scoped Prisma client, which is itself an unscoped read of
 * an RLS table and resolves `null` under `FORCE ROW LEVEL SECURITY` (the
 * exact blocker this closes; see ADR-026 §3.1 for why the SECURITY DEFINER
 * shape survives FORCE and a plain model read does not).
 *
 * Resolves to `null` when the key is missing/malformed, the entity does not
 * exist, or the entity has no venue — `requireVenueAccess` turns `null` into
 * a 403, never leaking existence to non-members.
 */
export function venueIdFromEntity(
  kind: EntityKind,
  getKey: (request: FastifyRequest) => unknown
): VenueIdResolver {
  return async (request) => {
    const key = getKey(request);
    if (typeof key !== "string") return null;
    return resolveVenueId(kind, key);
  };
}

/**
 * Resolves the venue owning the entity addressed by `key`, then runs `load`
 * inside that venue's RLS context (`runWithVenueContext`, ADR-026 §4) so a
 * handler's own subsequent read or write of the entity succeeds under
 * `FORCE ROW LEVEL SECURITY` instead of repeating the unscoped-read trap
 * `venueIdFromEntity` above exists to close (ADR-026 §3.3 item 2 / #5369
 * PR 5) — `requireVenueAccess`'s resolver only decides authorization; it
 * never sets `app.venue_id` for the rest of the request.
 *
 * Returns `fallback` without calling `load` at all when the venue cannot be
 * resolved (entity missing, or has no venue per ADR-026 §2) — the same
 * "not found" outcome the caller already produces for that case, without an
 * extra unscoped query.
 */
export async function loadInVenueContext<T>(
  kind: EntityKind,
  key: string,
  load: () => Promise<T>,
  fallback: T
): Promise<T> {
  const venueId = await resolveVenueId(kind, key);
  if (!venueId) return fallback;
  return runWithVenueContext(venueId, load);
}
