import type { FastifyReply, FastifyRequest } from "fastify";
import type { VenueIdResolver } from "@mbe/auth/fastify";
import { enterVenueContext } from "../services/venue-context-store.js";
import { recordUnscopedRlsQuery } from "../services/rls-context-mode.js";

/**
 * Postgres RLS venue-scoping backstop (ADR-026), part 5/7.
 *
 * Minimal shape needed to issue the `set_config()` call — any of the
 * top-level `PrismaClient` or a `Prisma.TransactionClient` — that exposes
 * tagged-template `$executeRaw`.
 */
export interface VenueContextClient {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
}

export interface SetVenueContextOptions {
  /**
   * Set ONLY by `venue-scoped-prisma.ts`'s auto-wrap Proxy. That call site
   * already runs its own `RLS_MODELS`-gated unscoped-query check (ADR-026
   * §3.3 / #5369 PR 1) before calling this function — `setVenueContext` is
   * generic over every model's explicit transaction (RLS-scoped or not, e.g.
   * `venueGroup`/`reservationHold`/`venueMembership`, which carry no RLS
   * policy at all) and has no way to tell them apart on its own. Without this
   * flag, every non-RLS model call from the auto-wrap would also be
   * misreported as an unscoped RLS query. Every other caller — the seven
   * explicit `prisma.$transaction` call sites that manage their own
   * transaction boundary, all of which address an RLS-scoped table — leaves
   * this unset and gets the check below.
   */
  skipUnscopedQueryCheck?: boolean;
}

/**
 * Sets the `app.venue_id` Postgres session variable (ADR-026 §4) via
 * `set_config('app.venue_id', <venueId>, true)`, using Prisma's
 * tagged-template `$executeRaw` — never raw string interpolation — so a
 * venue id can never be used for SQL injection.
 *
 * `set_config()` is used instead of `SET LOCAL app.venue_id = <value>`
 * because Postgres's `SET`/`SET LOCAL` grammar only accepts a literal or
 * identifier in the value position, never a bind parameter — a tagged
 * template's interpolated value always compiles to one, so `SET LOCAL`
 * throws `syntax error at or near "$1"` against real Postgres.
 * `set_config(setting_name, new_value, is_local)` accepts `new_value` as a
 * normal parameter, and `is_local = true` gives it the exact same
 * transaction-scoped semantics as `SET LOCAL` (resets at transaction end,
 * per Postgres docs on `set_config`). The setting name itself stays a SQL
 * literal — it's not attacker-controlled — only the venue id needs
 * parameterization, and it still gets it.
 *
 * When `venueId` is `null`/`undefined`, this is a deliberate no-op:
 * `app.venue_id` stays unset, so every ADR-026 RLS policy's
 * `current_setting('app.venue_id', true)` evaluates to SQL `NULL`, which per
 * ADR-026 §4 is default-deny (zero rows visible or writable) — not an error
 * and not "every venue". This is the correct behavior for requests with no
 * resolved venue context (public routes, the platform-admin cross-venue
 * escape hatch, etc).
 *
 * Correctness note (ADR-026 §4): the `is_local = true` argument makes this
 * transaction-scoped in Postgres, identical to `SET LOCAL`. Callers MUST
 * invoke this with a Prisma transaction client (`Prisma.TransactionClient`)
 * obtained from `prisma.$transaction(...)` — called against the top-level
 * `PrismaClient` singleton outside an explicit transaction, the setting has
 * no effect beyond that one implicit statement, and evaporates before any
 * later query in the same request runs. `venueContextPreHandler` below does
 * NOT call this function directly against the singleton (that was the
 * ADR-026 part 6 bug this module's callers must avoid) — it stashes the
 * resolved venue id via `enterVenueContext` (`../services/venue-context-store.js`)
 * instead, and the actual query-issuing paths (the wrapped `prisma` export in
 * `../services/database.ts`, and a handful of existing explicit
 * `$transaction`/raw-query call sites) read it back via `getCurrentVenueId`
 * and call this function against THEIR OWN transaction client.
 */
export async function setVenueContext(
  client: VenueContextClient,
  venueId: string | null | undefined,
  options: SetVenueContextOptions = {}
): Promise<void> {
  if (!venueId) {
    if (!options.skipUnscopedQueryCheck) {
      // `model: null` — this function doesn't know which table its caller's
      // transaction addresses; see `UnscopedRlsQueryDetails.model`'s doc
      // comment in `../services/rls-context-mode.ts`.
      recordUnscopedRlsQuery({ model: null, method: "setVenueContext" });
    }
    return;
  }
  await client.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
}

/**
 * Fastify preHandler factory (ADR-026 part 6, wired app-wide in `app.ts`).
 * Resolves the request's venue id the same way `requireVenueAccess`
 * (ADR-020) routes already do — via a `VenueIdResolver`, shared with
 * `@mbe/auth/fastify` — and stashes it in the request-scoped
 * `venue-context-store` (`enterVenueContext`) for the rest of the request.
 *
 * Deliberately does NOT call `setVenueContext` here: doing so against the
 * top-level `prisma` singleton is the transaction-scoping bug documented on
 * `setVenueContext` above — the setting would evaporate before any query
 * this request issues. Every query-issuing path reads the stashed id back
 * via `getCurrentVenueId` and calls `setVenueContext` against its OWN
 * transaction client instead.
 *
 * Unauthenticated/public routes (no venue context resolved yet, e.g.
 * `/public/v1/venues/:slug/*` before the slug is resolved) are handled by
 * simply stashing `null`: `getCurrentVenueId` then returns `null`, and
 * `setVenueContext` no-ops on it — the ADR-026 §4 default-deny behavior,
 * not an error.
 *
 * Calls `enterVenueContext` SYNCHRONOUSLY whenever `resolveVenueId` resolves
 * to a plain (non-Promise) value — never via `await resolveVenueId(request)`
 * followed by a separate statement. This is load-bearing, not stylistic:
 * measured against this Fastify version (5.12.3) with the real reservations
 * app (`services/reservations/src/app.ts`) registered end to end, a global
 * `addHook("preHandler", ...)` whose body does `await resolveVenueId(...)`
 * *then* `enterVenueContext(...)` — even when `resolveVenueId` itself is
 * fully synchronous, so the `await` only costs one microtask tick — reliably
 * shows the resolved venue id one full HTTP request LATE: request N's
 * `enterVenueContext` call becomes visible starting at request N+1's
 * `onRequest` hook, not within request N's own remaining lifecycle. A
 * version of this same hook that never awaits before calling
 * `enterVenueContext` (this implementation) does not reproduce it, verified
 * against the same app. The resolvers this hook is actually composed from
 * (`venueIdFromQuery`/`venueIdFromBody`/`venueIdFromParams` in
 * `../routes/venue-access.ts`) are all synchronous today, so the fast path
 * below is what always runs in production; the `PromiseLike` branch exists
 * only because `VenueIdResolver`'s type permits an async resolver (e.g.
 * `venueIdFromEntity`) and this factory must not silently produce wrong
 * results if one is ever passed here — it is NOT verified to be free of the
 * same timing issue, since nothing exercises it today.
 *
 * The returned function is declared `async` and therefore ALWAYS returns a
 * genuine `Promise` (never a bare `undefined`), even down the synchronous
 * path below — this is a second, independently load-bearing requirement,
 * not just the first one's implementation detail. Fastify's preHandler hook
 * runner (`lib/hooks.js`'s `hookIterator`) always invokes a registered hook
 * as `fn(request, reply, next)` and only re-invokes `next` itself when the
 * hook's return value is thenable (`result && typeof result.then ===
 * "function"`); a hook that ignores the `next` argument (as this one does —
 * it takes only 2 params) AND returns a plain non-Promise value satisfies
 * neither of Fastify's two completion contracts (call `next` yourself, or
 * return a Promise), so the preHandler chain hangs forever with no error.
 * Measured directly: making this a plain (non-`async`) function that
 * returns `undefined` on the synchronous path reproduces exactly that hang
 * against the real app — `fastify.inject()` never resolves.
 */
export function venueContextPreHandler(
  resolveVenueId: VenueIdResolver
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function setVenueContextPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const result = resolveVenueId(request);
    if (isThenable(result)) {
      const venueId = await result;
      enterVenueContext(typeof venueId === "string" ? venueId : null);
      return;
    }
    enterVenueContext(typeof result === "string" ? result : null);
  };
}

function isThenable(value: unknown): value is PromiseLike<string | null | undefined> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
