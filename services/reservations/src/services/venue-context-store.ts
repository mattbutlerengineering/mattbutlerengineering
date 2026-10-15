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
 * Instead, `venueScoped` (`../routes/venue-scope.ts`) or an explicit
 * `runWithVenueContext` call stashes the venue id here, and every
 * query-issuing path reads it back via `getCurrentVenueId` and calls
 * `setVenueContext(tx, ...)` as the first statement of ITS OWN transaction —
 * either the per-call transaction the wrapped `prisma` export in
 * `database.ts` opens automatically, or an existing explicit
 * `prisma.$transaction(...)` call site.
 */
const venueContextStorage = new AsyncLocalStorage<string | null>();

/**
 * Runs `fn` with `venueId` as the venue context, restoring whatever context
 * surrounded the call once `fn` settles (including on rejection).
 *
 * For a route handler (or job) that has resolved a venue id of its own and
 * wants the rest of its work scoped to it (ADR-026 part 6).
 *
 * `run` — not `enterWith` — is load-bearing: `enterWith` mutates the CURRENT
 * async execution context, so calling it after an `await` (which a DB-backed
 * venue lookup always needs) sets the store on the awaiting microtask rather
 * than on the caller's continuation, and the venue shows up one request late.
 * `run(store, fn)` scopes the store to `fn`'s own async context instead, so
 * every `await` INSIDE `fn` observes it, and nothing outside `fn` is affected.
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
