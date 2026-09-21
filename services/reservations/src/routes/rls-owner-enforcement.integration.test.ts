import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { MIGRATIONS_DIR, parseRlsDeclarations } from "../services/rls-force-coverage.js";

/**
 * Issue #5369: proves ADR-026's RLS backstop against **the role the deployed
 * service actually connects as** — `DATABASE_URL`, which is also the role that
 * ran `prisma migrate deploy` and therefore OWNS every table it created.
 *
 * The sibling suite `./rls-isolation.integration.test.ts` provisions a separate,
 * ordinary non-owner role and runs every assertion through it. That is what let
 * the whole seven-part series (#5248-#5255, #5492) ship, pass and close green
 * while providing zero protection: Postgres skips RLS for a table's owner unless
 * the table also carries `FORCE ROW LEVEL SECURITY`, and no migration sets it —
 * so the one role the policies were never inert for is the only role that was
 * ever tested. This suite deliberately uses no probe role at all.
 *
 * **Two guards make that unfakeable**, and both are asserted as tests rather than
 * assumed in a comment:
 *
 * 1. the connection is owner-privileged for all seven tables, checked against
 *    `pg_class.relowner` rather than a role name — a probe role fails this; and
 * 2. the connection is neither `SUPERUSER` nor `BYPASSRLS` — those bypass row
 *    security unconditionally, FORCE included, so every owner-side result from
 *    such a role is worthless. ADR-026 §3.1 records losing a whole measurement
 *    round to exactly that (`postgres` superuser), which is why it is a hard
 *    assertion here and not a caveat.
 *
 * Requires a real, migrated Postgres at `DATABASE_URL` whose owning role is a
 * plain non-superuser — the shape DigitalOcean Managed Postgres gives us in
 * production. Create one with:
 *
 * ```sql
 * CREATE ROLE rls_owner LOGIN PASSWORD '...' CREATEDB;
 * CREATE DATABASE rls_scratch OWNER rls_owner;
 * ```
 *
 * then `DATABASE_URL=postgresql://rls_owner:...@host/rls_scratch pnpm --dir
 * services/reservations db:migrate:deploy`. Skips loudly (`describe.skipIf`)
 * when `DATABASE_URL` is unset: CI's `test` job attaches no Postgres, so this
 * reports as skipped there — never as a pass on a mock.
 */

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Advisory-lock key shared with `./rls-isolation.integration.test.ts` and
 * `../services/lapsed-guest-cron.rls.integration.test.ts`. All three toggle or
 * observe `FORCE ROW LEVEL SECURITY`, which is per-table cluster state visible
 * to every connection, and vitest runs test FILES in parallel workers — without
 * the lock one suite's FORCE window lands inside another's owner-side writes.
 * Held on a DEDICATED client, since `pg_advisory_lock` is session-scoped.
 */
const RLS_SUITE_LOCK_KEY = 5369;

/** The seven tables ADR-026 §1 puts under RLS. */
const RLS_TABLES = [
  "venues",
  "floor_plans",
  "tables",
  "guests",
  "reservations",
  "deposits",
  "waitlist_entries",
] as const;

/** What the committed migrations declare, so no assertion below hardcodes today's state. */
const declaredForce = parseRlsDeclarations(
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(join(MIGRATIONS_DIR, entry.name, "migration.sql"), "utf8"))
).forced;

describe.skipIf(!DATABASE_URL)("RLS enforcement against the app's OWN owning role (#5369)", () => {
  const venueAId = `rls-owner-a-${randomUUID()}`;
  const venueBId = `rls-owner-b-${randomUUID()}`;

  let lockClient: pg.Client;
  let app: pg.Client;

  /** Runs `work` with `app.venue_id` set for its whole transaction. */
  async function inVenue<T>(venueId: string, work: () => Promise<T>): Promise<T> {
    await app.query("BEGIN");
    try {
      await app.query("SELECT set_config('app.venue_id', $1, true)", [venueId]);
      const result = await work();
      await app.query("COMMIT");
      return result;
    } catch (error) {
      await app.query("ROLLBACK");
      throw error;
    }
  }

  async function visibleVenueIds(venueId?: string): Promise<string[]> {
    const read = async (): Promise<string[]> => {
      const { rows } = await app.query<{ id: string }>(
        "SELECT id FROM venues WHERE id = ANY($1) ORDER BY id",
        [[venueAId, venueBId]]
      );
      return rows.map((row) => row.id);
    };
    return venueId === undefined ? read() : inVenue(venueId, read);
  }

  async function setForce(on: boolean): Promise<void> {
    for (const table of RLS_TABLES) {
      await app.query(`ALTER TABLE "${table}" ${on ? "FORCE" : "NO FORCE"} ROW LEVEL SECURITY`);
    }
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    app = new pg.Client({ connectionString: DATABASE_URL });
    await app.connect();

    // Seeded inside each row's own venue context, so this works identically
    // whether or not FORCE is set — the ids are supplied rather than generated
    // so `venue_isolation`'s WITH CHECK (id = current_setting(...)) can match.
    for (const id of [venueAId, venueBId]) {
      await inVenue(id, async () => {
        await app.query(
          `INSERT INTO venues (id, name, slug, iana_timezone, updated_at)
           VALUES ($1, $2, $3, 'UTC', now())`,
          [id, `RLS Owner ${id}`, id]
        );
      });
    }
  });

  afterAll(async () => {
    // Restore whatever the migrations declare, never a hardcoded state: if a
    // FORCE migration has landed, leaving these tables NO FORCE would silently
    // undo it on the target database.
    await setForce(declaredForce.has("venues"));

    for (const id of [venueAId, venueBId]) {
      await inVenue(id, async () => {
        await app.query("DELETE FROM venues WHERE id = $1", [id]);
      });
    }

    await app.end();
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  });

  it("connects as a role Postgres treats as the OWNER of all seven tables, not a probe role", async () => {
    const { rows } = await app.query<{ relname: string; owner_privileged: boolean }>(
      `SELECT c.relname,
              pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE') AS owner_privileged
         FROM pg_catalog.pg_class c
        WHERE c.relname = ANY($1)
          AND c.relkind = 'r'
          AND c.relnamespace = 'public'::regnamespace
        ORDER BY c.relname`,
      [[...RLS_TABLES]]
    );

    expect(rows).toHaveLength(RLS_TABLES.length);
    expect(rows.filter((row) => !row.owner_privileged)).toEqual([]);
  });

  it("connects as a NON-superuser, NON-BYPASSRLS role — the only shape where RLS is observable", async () => {
    const { rows } = await app.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
    );

    // A superuser or BYPASSRLS role skips row security unconditionally, FORCE
    // included, so a green run through one would prove nothing at all. Point
    // DATABASE_URL at a database owned by a plain role (see the module doc).
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("has live relforcerowsecurity matching exactly what the committed migrations declare", async () => {
    const { rows } = await app.query<{ relname: string; relforcerowsecurity: boolean }>(
      // Scoped to ordinary public tables: information_schema also owns a view
      // called `tables`, which would otherwise join this result.
      `SELECT relname, relforcerowsecurity FROM pg_class
        WHERE relname = ANY($1)
          AND relkind = 'r'
          AND relnamespace = 'public'::regnamespace
        ORDER BY relname`,
      [[...RLS_TABLES]]
    );

    expect(rows.filter((row) => row.relforcerowsecurity).map((row) => row.relname)).toEqual(
      [...RLS_TABLES].filter((table) => declaredForce.has(table)).sort()
    );
  });

  it("enforces venue isolation against the owning role only when FORCE is declared", async () => {
    // Derived from the migrations rather than pinned, so this assertion is the
    // same one before and after the flip and never blocks it. Today it measures
    // the #5369 finding: `app.venue_id` is set to venue B and venue A's row comes
    // back anyway, because the policies do not apply to the owner.
    const visible = await visibleVenueIds(venueBId);

    expect(visible).toEqual(declaredForce.has("venues") ? [venueBId] : [venueAId, venueBId].sort());
  });

  it("becomes venue-isolated for that SAME owning connection the moment FORCE is set", async () => {
    // The fix, measured end to end on the production-shaped role: no role change,
    // no probe connection, no application code — only the table flag moves.
    await setForce(true);
    try {
      expect(await visibleVenueIds(venueBId)).toEqual([venueBId]);
      expect(await visibleVenueIds(venueAId)).toEqual([venueAId]);
      // No venue context at all is default-deny (ADR-026 §4), not "every venue".
      expect(await visibleVenueIds()).toEqual([]);
    } finally {
      await setForce(declaredForce.has("venues"));
    }
  });

  it("refuses a cross-venue WRITE from the owning connection once FORCE is set", async () => {
    // `venue_isolation` is FOR ALL, so the flip has to close writes as well as
    // reads — a backstop that only hid rows would still let a mis-scoped UPDATE
    // corrupt another venue.
    await setForce(true);
    try {
      const updated = await inVenue(venueBId, async () => {
        const { rowCount } = await app.query(
          "UPDATE venues SET currency_code = 'EUR' WHERE id = $1",
          [venueAId]
        );
        return rowCount;
      });

      expect(updated).toBe(0);
    } finally {
      await setForce(declaredForce.has("venues"));
    }
  });
});
