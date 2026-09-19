import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped venue id, propagated via `AsyncLocalStorage` (ADR-026 part 6).
 *
 * Postgres's `set_config(..., is_local=true)` (ADR-026 §4) is
 * transaction-scoped: a bare (non-`$transaction`) Prisma call auto-commits as
 * its own implicit transaction, so calling `setVenueContext` against the
 * top-level `prisma` singleton evaporates before any later query in the same
 * request runs — the setting never reaches the query it was meant to scope.
 *
 * The fix is to never call `setVenueContext` against the singleton eagerly.
 * Instead, the app-bootstrap preHandler (`venueContextPreHandler` in
 * `../middleware/venue-context.ts`) stashes the resolved venue id here via
 * `enterVenueContext`, and every query-issuing path reads it back via
 * `getCurrentVenueId` and calls `setVenueContext(tx, ...)` as the first
 * statement of ITS OWN transaction — either the per-call transaction the
 * wrapped `prisma` export in `database.ts` opens automatically, or an
 * existing explicit `prisma.$transaction(...)` call site.
 *
 * `enterWith` (not `run`) is used deliberately: Fastify's shared
 * `addHook("preHandler", ...)` has no callback to wrap the rest of the
 * request in, so there is no `run(store, callback)` continuation available.
 * `enterWith` instead transitions the CURRENT async execution context for
 * the remainder of the request — verified empirically against this Fastify
 * version to propagate correctly through later hooks and the route handler,
 * with correct per-request isolation under concurrency (no cross-request
 * bleed, since each request's continuation is a distinct async context).
 */
const venueContextStorage = new AsyncLocalStorage<string | null>();

/** Enters the async context carrying `venueId` for the rest of the request. */
export function enterVenueContext(venueId: string | null): void {
  venueContextStorage.enterWith(venueId);
}

/**
 * Reads the current request's resolved venue id. Returns `null` outside any
 * request context (e.g. a background job) or when no venue id was resolved —
 * both are the ADR-026 §4 default-deny case, not an error.
 */
export function getCurrentVenueId(): string | null {
  return venueContextStorage.getStore() ?? null;
}
