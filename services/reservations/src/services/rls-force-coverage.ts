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
 * That first column is what production did while FORCE was absent (issue
 * #5369). The seven-part series (#5248-#5255, plus #5492) shipped and closed
 * green because every isolation test probed with a separate non-owner role,
 * the one role the policies were never inert for.
 *
 * The seven venue tables are forced in
 * `20261009000100_grant_app_reservations_and_force_rls`. The non-owner role
 * `app_reservations` (`NOLOGIN NOINHERIT`) is created in
 * `20261009000000_create_app_reservations_role`. Migrate stays the table
 * owner on `DATABASE_URL`. App transactions assume `app_reservations` via
 * `assumeAppRole` (`SET LOCAL ROLE`) before their first query. This module
 * only checks migration text.
 *
 * An RLS-enabled table must be forced, or appear in {@link PENDING_FORCE_TABLES}
 * with the reason recorded. A name in that list that the migrations already
 * force fails too — the list must not keep describing a closed gap. An eighth
 * venue-scoped table added with `ENABLE` alone fails at the moment its
 * migration is written.
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
 * RLS-enabled tables that do NOT yet carry `FORCE ROW LEVEL SECURITY`.
 *
 * Empty. The seven venue tables are forced in
 * `20261009000100_grant_app_reservations_and_force_rls`. A name left here
 * after its migration already forces it is reported by {@link unforcedRlsTables}.
 * A later table added with `ENABLE` alone is listed here, with the reason, in
 * the same change — or it is forced.
 */
export const PENDING_FORCE_TABLES = [] as const;

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
 * Comments are stripped first, because
 * `20260920000000_add_cross_venue_read_escape_hatch` mentions FORCE only in
 * prose explaining that it does NOT set it. A raw text match would read that
 * as enforcement.
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
 * Three directions are failures. An unlisted enabled-but-unforced table is the
 * #5369 bug recurring. A listed table that no migration enables is an
 * acknowledgement protecting nothing. A listed table the migrations already
 * force is a closed gap still described as open.
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
  const closed = [...acknowledged].filter((table) => declarations.forced.has(table));

  return [...new Set([...unaccounted, ...stale, ...closed])].sort();
}
