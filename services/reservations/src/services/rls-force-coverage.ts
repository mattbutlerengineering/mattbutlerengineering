import { fileURLToPath } from "node:url";

/**
 * Static guard for the one property that decides whether ADR-026's Row-Level
 * Security backstop protects anything at all: **`ENABLE ROW LEVEL SECURITY`
 * does not apply to a table's OWNER unless the table also carries
 * `FORCE ROW LEVEL SECURITY`** — and `services/reservations` connects to
 * Postgres with the same role that ran `prisma migrate deploy`, which owns
 * every table it created.
 *
 * Measured against a migrated database with a non-superuser owner, the exact
 * shape DigitalOcean Managed Postgres gives us (2026-09-21, Postgres 16,
 * `rolsuper=f rolbypassrls=f`):
 *
 * | Query as the owning role                          | FORCE absent  | FORCE set  |
 * | ------------------------------------------------- | ------------- | ---------- |
 * | `SELECT count(*) FROM venues`, `app.venue_id` unset | **2 of 2**   | 0          |
 * | same, `app.venue_id` set to venue B                 | **2 of 2**   | 1 (only B) |
 *
 * So the seven policies in the `2026091{4,5,6}*` / `20260919000000` migrations
 * are inert against the deployed connection: the first column is what production
 * does today. That is what issue #5369 reports, and it is why the seven-part
 * series (#5248-#5255, plus #5492) could ship, pass its tests and close green —
 * every isolation test probed with a SEPARATE non-owner role, which is the one
 * role the policies were never inert for.
 *
 * This module turns that lesson into a check that runs on every PR with no
 * database: an RLS-enabled table must either be forced, or appear in
 * {@link PENDING_FORCE_TABLES} with the reason recorded. An eighth venue-scoped
 * table added with `ENABLE` alone now fails at the moment its migration is
 * written, rather than shipping as a backstop that reads as protection.
 *
 * Deliberately parses the committed migration SQL rather than querying
 * `pg_class`: the check must run in CI's ordinary `test` job (part of
 * `CI Gate`), which has no Postgres attached. The real-database counterpart —
 * proving the semantics above against a role Postgres genuinely treats as the
 * table owner — is `../routes/rls-owner-enforcement.integration.test.ts`.
 */

/** Absolute path to this service's Prisma migration directory. */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations", import.meta.url));

/**
 * RLS-enabled tables that do NOT yet carry `FORCE ROW LEVEL SECURITY`, each an
 * acknowledged, tracked gap rather than an oversight.
 *
 * All seven are outstanding on issue #5369. The flip is blocked — not merely
 * unfinished — by ADR-026 §3.3: the lookup that resolves a route's venue is
 * itself an unscoped read of an RLS table, so under FORCE every entity-addressed
 * `/:id` route and the whole `/public/v1/venues/:slug/*` booking funnel answer
 * 404 before reaching the feature behind them. Measured end to end against the
 * real app on a migrated database (2026-09-21): 8 of 17 probed routes break,
 * including `GET /public/v1/venues/:slug`, which every public booking step
 * begins with.
 *
 * Emptying this list is the deliverable of whichever change closes those
 * blockers; it must land WITH the FORCE migration, never before it.
 */
export const PENDING_FORCE_TABLES = [
  "deposits",
  "floor_plans",
  "guests",
  "reservations",
  "tables",
  "venues",
  "waitlist_entries",
] as const;

/** Which tables the migrations enable, and which they additionally force. */
export interface RlsDeclarations {
  readonly enabled: ReadonlySet<string>;
  readonly forced: ReadonlySet<string>;
}

/** Strips `--` line comments and `/* *\/` block comments from SQL. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Lowercases and collapses every run of whitespace to one space, so the patterns
 * below need no `\s+` quantifiers — those are what make an otherwise trivial
 * keyword match a ReDoS candidate (`security/detect-unsafe-regex`).
 */
function normalizeSql(sql: string): string {
  return stripSqlComments(sql).toLowerCase().replace(/\s+/g, " ");
}

function matchTables(sql: string, verb: "enable" | "force"): string[] {
  // Declared inside the function, not at module scope: these carry the `g` flag,
  // and a shared `lastIndex` across calls would silently skip matches.
  const pattern =
    verb === "enable"
      ? /alter table (?:only )?"?([a-z_][a-z0-9_]*)"? enable row level security/g
      : /alter table (?:only )?"?([a-z_][a-z0-9_]*)"? force row level security/g;
  return [...sql.matchAll(pattern)].map((match) => match[1] as string);
}

/**
 * Reads RLS enable/force declarations out of migration SQL.
 *
 * Comments are stripped first, because the one migration in this service that
 * mentions FORCE at all (`20260920000000_add_cross_venue_read_escape_hatch`)
 * mentions it exclusively in prose explaining that it does NOT set it. A raw
 * text match would read that as enforcement.
 *
 * `NO FORCE ROW LEVEL SECURITY` is not matched (the `no` sits between the table
 * name and `force`), so a later migration turning enforcement back off correctly
 * leaves the table unforced.
 */
export function parseRlsDeclarations(sqlFiles: readonly string[]): RlsDeclarations {
  const enabled = new Set<string>();
  const forced = new Set<string>();

  for (const raw of sqlFiles) {
    const sql = normalizeSql(raw);
    for (const table of matchTables(sql, "enable")) enabled.add(table);
    for (const table of matchTables(sql, "force")) forced.add(table);
  }

  return { enabled, forced };
}

/**
 * Tables whose RLS is provably inert against the owning role and unaccounted
 * for, plus any acknowledgement that has gone stale.
 *
 * Both directions are failures. An unlisted enabled-but-unforced table is the
 * #5369 bug recurring. A listed table that no migration enables is an
 * acknowledgement protecting nothing — it reads as "known gap, tracked" while
 * tracking a table that was renamed or never enabled.
 */
export function unforcedRlsTables(
  declarations: RlsDeclarations,
  pending: readonly string[]
): string[] {
  const acknowledged = new Set(pending);

  const unaccounted = [...declarations.enabled].filter(
    (table) => !declarations.forced.has(table) && !acknowledged.has(table)
  );
  const stale = [...acknowledged].filter((table) => !declarations.enabled.has(table));

  return [...unaccounted, ...stale].sort();
}
