import type { VenueIdResolver } from "@mbe/auth/fastify";
import { runWithVenueContext } from "../services/venue-context-store.js";

/**
 * The UNSCOPED `cross-venue fan-out` routes (venue-scope-coverage.test.ts) do
 * not declare their scope through `venueScoped`, because `venueId` is
 * optional on them: a platform admin who names no venue gets an unfiltered
 * all-venue list, or creates a venue-less row. When a venue IS named, the
 * route's own `requireVenueAccess` guard (ADR-020) authorizes it and the
 * handler runs inside that venue's RLS context (ADR-026) via
 * {@link inNamedVenueContext}. When none is named, the handler runs with no
 * context, the ADR-026 §4 default-deny.
 */

/** Reads `venueId` from the query string, or `null`. */
export const queryVenueId: VenueIdResolver = (request) => {
  const query = request.query as { venueId?: unknown } | null | undefined;
  return typeof query?.venueId === "string" ? query.venueId : null;
};

/** Reads `venueId` from the request body, or `null`. */
export const bodyVenueId: VenueIdResolver = (request) => {
  const body = request.body as { venueId?: unknown } | null | undefined;
  return typeof body?.venueId === "string" ? body.venueId : null;
};

/** Runs `work` in `venueId`'s RLS context when one is named, else with no context. */
export function inNamedVenueContext<T>(
  venueId: string | null | undefined,
  work: () => Promise<T>
): Promise<T> {
  return typeof venueId === "string" ? runWithVenueContext(venueId, work) : work();
}
