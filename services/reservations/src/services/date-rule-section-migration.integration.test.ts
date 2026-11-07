import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

/**
 * Forward-migration proof for ADR-032's `date_rules.section_id`: every migration is applied, in
 * order, to a throwaway database created beside `DATABASE_URL`'s (never to `DATABASE_URL`'s own),
 * and dropped afterwards. The section migration is applied last, over a rule that already exists,
 * to show it is additive: the existing row survives with `section_id` NULL, nothing to backfill.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it (its owner role has
 * CREATEDB). Needs no advisory lock: it touches no shared database.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS = join(import.meta.dirname, "../../prisma/migrations");
/** All ~100 migrations apply here, well past the default 15s hook limit. */
const HOOK_TIMEOUT_MS = 120_000;
const SECTION_MIGRATION = "20261107120000_add_date_rule_section";

const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const sqlOf = (folder: string): string =>
  readFileSync(join(MIGRATIONS, folder, "migration.sql"), "utf8");

describe.skipIf(!DATABASE_URL)("add_date_rule_section migration (scratch database)", () => {
  const scratchName = `mig_scratch_${randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let scratch: pg.Client;

  const venueId = "v-mig";
  const planId = "fp-mig";
  const sectionId = "sec-mig";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DATABASE_URL! });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${scratchName}"`);

    const url = new URL(DATABASE_URL!);
    url.pathname = `/${scratchName}`;
    scratch = new pg.Client({ connectionString: url.toString() });
    await scratch.connect();

    // Everything before the section migration, then one rule that predates the column.
    expect(folders).toContain(SECTION_MIGRATION);
    for (const folder of folders.filter((f) => f < SECTION_MIGRATION)) {
      await scratch.query(sqlOf(folder));
    }
    // Row-level security (ADR-026) applies to the owner too: act as this venue for the session.
    await scratch.query(`SELECT set_config('app.venue_id', $1, false)`, [venueId]);
    await scratch.query(
      `INSERT INTO venues (id, name, slug, iana_timezone, updated_at)
         VALUES ($1, 'Migration venue', $1, 'UTC', now())`,
      [venueId]
    );
    await scratch.query(
      `INSERT INTO date_rules (id, venue_id, kind, target_kind, starts_on, created_by)
         VALUES ('dr-before', $1, 'closure', 'venue', '2026-12-24', 'actor')`,
      [venueId]
    );
    for (const folder of folders.filter((f) => f >= SECTION_MIGRATION)) {
      await scratch.query(sqlOf(folder));
    }
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await scratch?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await admin?.end();
  }, HOOK_TIMEOUT_MS);

  it("adds a nullable section_id and leaves an existing rule's NULL alone", async () => {
    const column = await scratch.query(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'date_rules' AND column_name = 'section_id'`
    );
    expect(column.rows).toEqual([{ is_nullable: "YES", column_default: null }]);
    const before = await scratch.query(`SELECT section_id FROM date_rules WHERE id = 'dr-before'`);
    expect(before.rows).toEqual([{ section_id: null }]);
  });

  it("inserts a section rule and nulls its section_id when the section is deleted", async () => {
    await scratch.query(
      `INSERT INTO floor_plans (id, venue_id, name, layout_json, updated_at)
         VALUES ($1, $2, 'Main', '{}', now())`,
      [planId, venueId]
    );
    await scratch.query(
      `INSERT INTO floor_plan_sections (id, venue_id, floor_plan_id, name, updated_at)
         VALUES ($1, $2, $3, 'Bar', now())`,
      [sectionId, venueId, planId]
    );
    await scratch.query(
      `INSERT INTO date_rules (id, venue_id, kind, target_kind, section_id, starts_on, created_by)
         VALUES ('dr-section', $1, 'closure', 'tables', $2, '2026-12-24', 'actor')`,
      [venueId, sectionId]
    );
    const saved = await scratch.query(`SELECT section_id FROM date_rules WHERE id = 'dr-section'`);
    expect(saved.rows).toEqual([{ section_id: sectionId }]);

    await scratch.query(`DELETE FROM floor_plan_sections WHERE id = $1`, [sectionId]);
    const after = await scratch.query(`SELECT section_id FROM date_rules WHERE id = 'dr-section'`);
    expect(after.rows).toEqual([{ section_id: null }]);
  });

  it("refuses a section that does not exist", async () => {
    await expect(
      scratch.query(
        `INSERT INTO date_rules (id, venue_id, kind, target_kind, section_id, starts_on, created_by)
           VALUES ('dr-bad', $1, 'closure', 'tables', 'no-such-section', '2026-12-24', 'actor')`,
        [venueId]
      )
    ).rejects.toMatchObject({ code: "23503" });
  });
});
