import { prisma } from "./database.js";

/**
 * Mirrors `app_resolve_venue_id`'s own allowlist CASE exactly
 * (`prisma/migrations/20260925010000_add_rls_venue_resolution_functions/migration.sql`).
 * Keep the two lists in lockstep — a kind added to only one either can never
 * be reached from TypeScript, or reaches the database only to be rejected by
 * the function's own `p_kind NOT IN (...)` check.
 */
export type EntityKind =
  | "reservation"
  | "table"
  | "guest"
  | "floor_plan"
  | "waitlist_entry"
  | "deposit"
  | "payment_intent"
  | "venue"
  | "venue_slug";

interface ResolvedVenueIdRow {
  app_resolve_venue_id: string | null;
}

/**
 * Resolves the venue id that owns a single entity addressed by `key` (and,
 * for `venue`/`venue_slug`, optionally narrowed to a `venue_group_id` via
 * `group`) — ADR-026 §3.3's fix for "the lookup that determines the scope
 * cannot run inside the scope it is computing".
 *
 * Calls the `SECURITY DEFINER` `app_resolve_venue_id` Postgres function
 * through the RAW (unscoped) Prisma client — `$queryRaw` tagged-template
 * parameters, never string interpolation, so `kind`/`key`/`group` can never
 * reach SQL unparameterized — rather than a venue-scoped
 * `prisma.<model>.findUnique(...)` call, which is exactly the "unscoped read
 * of an RLS table" trap this function exists to close (it would resolve
 * `null` under `FORCE ROW LEVEL SECURITY` for the same reason the entity
 * lookup it replaces did).
 *
 * Returns `null` when the key does not resolve to exactly one venue — the
 * entity is missing, has no venue (ADR-026 §2's nullable-`venue_id` case),
 * or — for `payment_intent`/ungrouped `venue_slug` — is ambiguous. Callers
 * MUST treat `null` as deny, never as "no scope needed": see the migration's
 * own comment and the PR 3 carry-forward note on issue #5369.
 */
export async function resolveVenueId(
  kind: EntityKind,
  key: string,
  group?: string | null
): Promise<string | null> {
  const rows = await prisma.$queryRaw<ResolvedVenueIdRow[]>`
    SELECT app_resolve_venue_id(${kind}, ${key}, ${group ?? null}) AS app_resolve_venue_id
  `;
  return rows[0]?.app_resolve_venue_id ?? null;
}
