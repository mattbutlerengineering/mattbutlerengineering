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

  it("still has FORCE outstanding on all seven, which is #5369's open finding", () => {
    // Deliberately asserts the CURRENT, measured state rather than the desired one —
    // this is the executable record that the ADR-026 series (#5248-#5255, #5492) shipped
    // and closed green while providing zero protection against the deployed role.
    // Whoever lands the FORCE migration deletes this test and the corresponding
    // PENDING_FORCE_TABLES entries in the same change.
    expect([...declarations.forced]).toEqual([]);
    expect([...PENDING_FORCE_TABLES].sort()).toEqual([...declarations.enabled].sort());
  });
});
