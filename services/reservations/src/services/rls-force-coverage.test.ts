import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PENDING_FORCE_TABLES,
  parseRlsDeclarations,
  unforcedRlsTables,
  MIGRATIONS_DIR,
} from "./rls-force-coverage.js";

describe("parseRlsDeclarations", () => {
  it("collects a table that a migration enables RLS on", () => {
    const decl = parseRlsDeclarations([`ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;`]);

    expect([...decl.enabled]).toEqual(["guests"]);
    expect([...decl.forced]).toEqual([]);
  });

  it("collects a table that a migration forces RLS on", () => {
    const decl = parseRlsDeclarations([
      `ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;`,
      `ALTER TABLE "guests" FORCE ROW LEVEL SECURITY;`,
    ]);

    expect([...decl.forced]).toEqual(["guests"]);
  });

  it("does NOT count FORCE mentioned only in a SQL comment", () => {
    // This is the exact shape of `20260920000000_add_cross_venue_read_escape_hatch`,
    // whose header prose says it exists to make "the eventual FORCE flip safe" and
    // explicitly states that nothing in it sets FORCE. A parser that matched the raw
    // text would read that migration as having forced `venues` and report the backstop
    // as enforcing when it is inert — the precise illusion #5369 is about.
    const decl = parseRlsDeclarations([
      `-- Nothing here sets FORCE ROW LEVEL SECURITY on "venues".`,
      `/* ALTER TABLE "venues" FORCE ROW LEVEL SECURITY; */`,
      `ALTER TABLE "venues" ENABLE ROW LEVEL SECURITY;`,
    ]);

    expect([...decl.enabled]).toEqual(["venues"]);
    expect([...decl.forced]).toEqual([]);
  });

  it("ignores NO FORCE, which turns enforcement back off", () => {
    const decl = parseRlsDeclarations([
      `ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;`,
      `ALTER TABLE "guests" NO FORCE ROW LEVEL SECURITY;`,
    ]);

    expect([...decl.forced]).toEqual([]);
  });

  it("reads unquoted and case-varied table names", () => {
    const decl = parseRlsDeclarations([`alter table deposits enable row level security;`]);

    expect([...decl.enabled]).toEqual(["deposits"]);
  });
});

describe("unforcedRlsTables", () => {
  it("reports a table that is RLS-enabled but not forced and not acknowledged", () => {
    const decl = parseRlsDeclarations([`ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;`]);

    expect(unforcedRlsTables(decl, [])).toEqual(["tables"]);
  });

  it("reports nothing when the table is forced", () => {
    const decl = parseRlsDeclarations([
      `ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;`,
      `ALTER TABLE "tables" FORCE ROW LEVEL SECURITY;`,
    ]);

    expect(unforcedRlsTables(decl, [])).toEqual([]);
  });

  it("reports nothing when the table is an acknowledged pending-FORCE entry", () => {
    const decl = parseRlsDeclarations([`ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;`]);

    expect(unforcedRlsTables(decl, ["tables"])).toEqual([]);
  });

  it("reports a pending entry that no migration enables RLS on, so the list cannot rot", () => {
    // A stale acknowledgement is its own defect: it reads as "known gap, tracked"
    // while protecting a table that no longer exists or was never enabled.
    const decl = parseRlsDeclarations([`ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;`]);

    expect(unforcedRlsTables(decl, ["tables", "long_gone"])).toEqual(["long_gone"]);
  });

  it("reports a pending name the migrations already force", () => {
    const decl = parseRlsDeclarations([
      `ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;`,
      `ALTER TABLE "tables" FORCE ROW LEVEL SECURITY;`,
    ]);

    expect(unforcedRlsTables(decl, ["tables"])).toEqual(["tables"]);
  });
});

describe("committed reservations migrations (ADR-026 / #5369)", () => {
  const sqlFiles = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(MIGRATIONS_DIR, entry.name, "migration.sql"))
    .map((path) => readFileSync(path, "utf8"));

  const declarations = parseRlsDeclarations(sqlFiles);

  it("enables RLS on exactly the seven venue-scoped tables ADR-026 §1 lists", () => {
    expect([...declarations.enabled].sort()).toEqual([
      "deposits",
      "floor_plans",
      "guests",
      "reservations",
      "tables",
      "venues",
      "waitlist_entries",
    ]);
  });

  it("leaves no RLS-enabled table silently unforced and unacknowledged", () => {
    // The guard this whole module exists for. `ENABLE ROW LEVEL SECURITY` alone does
    // NOT apply to a table's OWNER, and `services/reservations` connects with the same
    // role that ran its migrations — so an enabled-but-unforced table is a policy that
    // provably does nothing against the app's real connection (#5369). Adding an eighth
    // RLS table without `FORCE` (or without an entry below explaining why not) fails
    // here, at the moment the migration is written, instead of shipping as a backstop
    // that reads as protection and is not.
    expect(unforcedRlsTables(declarations, PENDING_FORCE_TABLES)).toEqual([]);
  });

  it("forces the seven venue tables and keeps the pending list empty", () => {
    expect([...declarations.forced].sort()).toEqual([...declarations.enabled].sort());
    expect([...PENDING_FORCE_TABLES]).toEqual([]);
  });
});

const VENUE_TABLES = [
  "venues",
  "floor_plans",
  "tables",
  "guests",
  "reservations",
  "deposits",
  "waitlist_entries",
] as const;

const DML_TABLES = [
  "venue_groups",
  "venues",
  "floor_plans",
  "tables",
  "guests",
  "reservations",
  "deposits",
  "waitlist_entries",
  "reservation_holds",
  "venue_memberships",
] as const;

/** Statements after comments are removed. A `--` comment is not a statement. */
function sqlStatements(sql: string): string[] {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

describe("app_reservations role and FORCE migrations", () => {
  const rolePath = join(
    MIGRATIONS_DIR,
    "20261009000000_create_app_reservations_role",
    "migration.sql"
  );
  const grantPath = join(
    MIGRATIONS_DIR,
    "20261009000100_grant_app_reservations_and_force_rls",
    "migration.sql"
  );
  it("creates app_reservations as one statement, comment included", () => {
    const roleSql = readFileSync(rolePath, "utf8");
    // Prisma 7.10 split_script_into_statements keeps a leading line comment on
    // the following statement (schema-engine postgres connector, test
    // split_script_into_statements_with_comments). The comment is allowed.
    expect(roleSql).toMatch(/Prisma 7\.10/);
    expect(sqlStatements(roleSql)).toEqual(["CREATE ROLE app_reservations NOLOGIN NOINHERIT"]);
    expect(roleSql.toLowerCase()).not.toMatch(/password|bypassrls/);
  });

  it("grants the role to the migrate user, DML on the ten tables, execute, and FORCE", () => {
    const grantSql = readFileSync(grantPath, "utf8");
    const normalized = grantSql.replace(/\s+/g, " ");

    expect(normalized).toMatch(/GRANT app_reservations TO CURRENT_USER/i);
    expect(normalized).not.toMatch(/grant\s+[a-z_][a-z0-9_]*\s+to\s+app_reservations/i);
    expect(normalized).toMatch(/GRANT USAGE ON SCHEMA public TO app_reservations/i);
    expect(normalized).not.toMatch(/ON ALL TABLES/i);
    expect(normalized).toMatch(
      /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_reservations/i
    );
    expect(normalized).not.toMatch(/FOR ROLE/i);

    const dml = normalized.match(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE (.+?) TO app_reservations/i
    );
    expect(dml).not.toBeNull();
    const granted = dml?.[1]?.split(",").map((name) => name.trim().replaceAll('"', "")) ?? [];
    expect(granted.sort()).toEqual([...DML_TABLES].sort());

    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION app_cross_venue_venues\(text\) TO app_reservations/i
    );
    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION app_resolve_venue_id\(text, text, text\) TO app_reservations/i
    );
    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION app_reservation_venue_ids_for_user\(text\) TO app_reservations/i
    );

    expect(normalized).toMatch(/SET lock_timeout = '5s'/);
    expect(normalized).toMatch(/RESET lock_timeout/);
    const forced = normalized.toLowerCase();
    for (const table of VENUE_TABLES) {
      expect(forced).toContain(`alter table "${table}" force row level security`);
    }

    expect(grantSql.toLowerCase()).not.toMatch(/password|bypassrls|grant usage on sequence/);
  });

  it("does not grant BYPASSRLS from seed", () => {
    const seed = readFileSync(join(MIGRATIONS_DIR, "..", "seed.ts"), "utf8");
    expect(seed).not.toMatch(/BYPASSRLS/);
  });
});

describe("stale FORCE-blocked prose", () => {
  it("drops the claim that ADR-026 §3.3 blocks the flip", () => {
    const source = readFileSync(new URL("./rls-force-coverage.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/The flip is blocked/);
    expect(source).not.toMatch(/blocks the flip/);
  });

  it("updates the reservations caveat and the funnel paragraph", () => {
    const claude = readFileSync(new URL("../../CLAUDE.md", import.meta.url), "utf8");
    expect(claude).not.toMatch(/do not have `FORCE ROW LEVEL SECURITY`/);
    expect(claude).not.toMatch(/would break under it/);
    expect(claude).toMatch(/app_reservations/);
  });

  it("amends ADR-026's closing sentence so the role and FORCE are not still open", () => {
    const adr = readFileSync(
      new URL("../../../../docs/adr/ADR-026-postgres-rls-venue-backstop.md", import.meta.url),
      "utf8"
    );
    const tail = adr.slice(adr.lastIndexOf("Issue #5369"));
    expect(tail).not.toMatch(/Still open under/);
    expect(tail).toMatch(/app_reservations/);
    expect(tail).toMatch(/FORCE ROW LEVEL SECURITY/);
  });
});
