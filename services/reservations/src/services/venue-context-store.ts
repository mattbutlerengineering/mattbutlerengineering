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
 * Runs `fn` with `venueId` as the venue context, restoring whatever context
 * surrounded the call once `fn` settles (including on rejection).
 *
 * This is the counterpart to `enterVenueContext` for the case where a
 * continuation to wrap DOES exist — a route handler that has just resolved a
 * venue id of its own and wants the rest of its work scoped to it (ADR-026
 * part 6; `../routes/deposits.ts` is the first caller, per issue #5382).
 *
 * `run` — not `enterWith` — is load-bearing here, and the two are NOT
 * interchangeable: `enterWith` mutates the CURRENT async execution context,
 * so calling it after an `await` (which a DB-backed venue lookup always
 * needs) sets the store on the awaiting microtask rather than on the caller's
 * continuation. That is the measured one-request-late propagation failure
 * documented on `venueContextPreHandler` (`../middleware/venue-context.ts`),
 * and it is exactly the shape a route handler resolving its venue from the
 * database would hit. `run(store, fn)` scopes the store to `fn`'s own async
 * context instead, so every `await` INSIDE `fn` observes it, and nothing
 * outside `fn` is affected.
 */
export function runWithVenueContext<T>(venueId: string, fn: () => Promise<T>): Promise<T> {
  return venueContextStorage.run(venueId, fn);
}

/**
 * Reads the current request's resolved venue id. Returns `null` outside any
 * request context (e.g. a background job) or when no venue id was resolved —
 * both are the ADR-026 §4 default-deny case, not an error.
 */
export function getCurrentVenueId(): string | null {
  return venueContextStorage.getStore() ?? null;
}
