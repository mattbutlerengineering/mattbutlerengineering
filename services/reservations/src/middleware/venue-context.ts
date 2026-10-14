import { assumeAppRole } from "../services/assume-app-role.js";
import { recordUnscopedRlsQuery } from "../services/rls-context-mode.js";

/**
 * Postgres RLS venue-scoping backstop (ADR-026), part 5/7.
 *
 * Minimal shape needed to assume `app_reservations` and issue the
 * `set_config()` call — any of the top-level `PrismaClient` or a
 * `Prisma.TransactionClient` — that exposes `$executeRawUnsafe` and
 * tagged-template `$executeRaw`.
 */
export interface VenueContextClient {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $executeRawUnsafe: (query: string) => Promise<number>;
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
 * The first statement is always `SET LOCAL ROLE "app_reservations"`
 * (`assumeAppRole`), including when `venueId` is `null`/`undefined`.
 * `set_config` is still skipped in that case: `app.venue_id` stays unset, so
 * every ADR-026 RLS policy's `current_setting('app.venue_id', true)` evaluates
 * to SQL `NULL`, which per ADR-026 §4 is default-deny (zero rows visible or
 * writable) — not an error and not "every venue". This is the correct
 * behavior for requests with no resolved venue context (public routes, the
 * platform-admin cross-venue escape hatch, etc).
 *
 * Correctness note (ADR-026 §4): the `is_local = true` argument makes this
 * transaction-scoped in Postgres, identical to `SET LOCAL`. Callers MUST
 * invoke this with a Prisma transaction client (`Prisma.TransactionClient`)
 * obtained from `prisma.$transaction(...)` — called against the top-level
 * `PrismaClient` singleton outside an explicit transaction, the setting has
 * no effect beyond that one implicit statement, and evaporates before any
 * later query in the same request runs. Nothing calls this function against
 * the singleton (that was the ADR-026 part 6 bug this module's callers must
 * avoid): `venueScoped` (or an explicit `runWithVenueContext`) stashes the
 * resolved venue id in `../services/venue-context-store.js`, and the actual
 * query-issuing paths (the wrapped `prisma` export in
 * `../services/database.ts`, and a handful of existing explicit
 * `$transaction`/raw-query call sites) read it back via `getCurrentVenueId`
 * and call this function against THEIR OWN transaction client.
 */
export async function setVenueContext(
  client: VenueContextClient,
  venueId: string | null | undefined,
  options: SetVenueContextOptions = {}
): Promise<void> {
  await assumeAppRole(client);
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
