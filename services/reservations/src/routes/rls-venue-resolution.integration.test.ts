import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { MIGRATIONS_DIR, parseRlsDeclarations } from "../services/rls-force-coverage.js";

/**
 * ADR-026 §3.3 / issue #5369, PR 3 of the enforcement sequence: proves the
 * venue-resolution primitives added by
 * `20260924000000_add_rls_venue_resolution_functions` — `app_resolve_venue_id`
 * and `app_reservation_venue_ids_for_user` — against a real, migrated
 * Postgres, using the SAME production-shaped non-superuser owner role the
 * sibling RLS suites use (`rls-owner-enforcement.integration.test.ts`'s
 * module doc has the provisioning recipe).
 *
 * **Runs its "does this actually use the admitting policy, not owner-bypass"
 * proof under `FORCE ROW LEVEL SECURITY`**, exactly like
 * `rls-isolation.integration.test.ts` does for `app_cross_venue_venues`: with
 * FORCE absent, the owning connection sees every row regardless of any
 * policy, so a resolver that "worked" under those conditions would prove
 * nothing about the new `<table>_cross_venue_read` policies this migration
 * adds — it would be indistinguishable from plain owner-bypass. Forcing RLS
 * for this suite's duration is what makes a passing assertion mean the
 * SECURITY DEFINER + marker + owner-conjunct mechanism is what let the read
 * through, not the absence of enforcement.
 *
 * Shares `pg_advisory_lock(5369)` with the other real-Postgres RLS suites
 * (`rls-owner-enforcement.integration.test.ts`, `rls-isolation.integration.test.ts`,
 * `rls-route-sweep.integration.test.ts`, `../services/lapsed-guest-cron.rls.integration.test.ts`)
 * — all toggle or observe `FORCE ROW LEVEL SECURITY`, which is per-table
 * cluster state visible to every connection, and vitest runs test files in
 * parallel workers.
 *
 * Requires a real, migrated Postgres at `DATABASE_URL` whose owning role is a
 * plain non-superuser (production's shape). Skips loudly (`describe.skipIf`)
 * when `DATABASE_URL` is unset — CI's ordinary `test` job has no Postgres
 * attached, so this reports as skipped there, never as a false pass.
 */

const DATABASE_URL = process.env.DATABASE_URL;
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

/** No table set FORCE at the time this suite was written; derived, not hardcoded, per the sibling suites' own convention. */
const declaredForce = parseRlsDeclarations(
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(join(MIGRATIONS_DIR, entry.name, "migration.sql"), "utf8"))
).forced;

/** A role with ordinary DML privileges only — never granted EXECUTE on either new function. */
const PROBE_ROLE = "rls_venue_resolution_probe_role";
const PROBE_PASSWORD = "rls_venue_resolution_probe_password";

describe.skipIf(!DATABASE_URL)("RLS venue-resolution functions (#5369 PR 3)", () => {
  let lockClient: pg.Client;
  let owner: pg.Client;
  let probe: pg.Client;

  const venueAId = `rls-resolve-venue-a-${randomUUID()}`;
  const venueBId = `rls-resolve-venue-b-${randomUUID()}`;
  const venueASlug = `rls-resolve-a-${randomUUID()}`;
  const groupAId = `rls-resolve-group-a-${randomUUID()}`;
  const tableAId = `rls-resolve-table-a-${randomUUID()}`;
  const tableBId = `rls-resolve-table-b-${randomUUID()}`;
  const guestAId = `rls-resolve-guest-a-${randomUUID()}`;
  const floorPlanAId = `rls-resolve-fp-a-${randomUUID()}`;
  const waitlistAId = `rls-resolve-wl-a-${randomUUID()}`;
  const reservationAId = `rls-resolve-res-a-${randomUUID()}`;
  const reservationA2Id = `rls-resolve-res-a2-${randomUUID()}`;
  const reservationBId = `rls-resolve-res-b-${randomUUID()}`;
  const depositAId = `rls-resolve-dep-a-${randomUUID()}`;
  const paymentIntentId = `pi_rls_resolve_${randomUUID()}`;
  const reservationUserId = `rls-resolve-user-${randomUUID()}`;

  async function setForce(on: boolean): Promise<void> {
    for (const table of RLS_TABLES) {
      await owner.query(`ALTER TABLE "${table}" ${on ? "FORCE" : "NO FORCE"} ROW LEVEL SECURITY`);
    }
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    owner = new pg.Client({ connectionString: DATABASE_URL });
    await owner.connect();

    // Idempotent, ordinary-DML-only role — deliberately never granted EXECUTE
    // on either new function, so the "REVOKE FROM PUBLIC" test below has
    // nothing else that could explain a successful call.
    await owner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN
          CREATE ROLE ${PROBE_ROLE} LOGIN PASSWORD '${PROBE_PASSWORD}';
        END IF;
      END
      $$;
    `);
    await owner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${PROBE_ROLE}`
    );

    probe = new pg.Client({
      connectionString: withRole(DATABASE_URL as string, PROBE_ROLE, PROBE_PASSWORD),
    });
    await probe.connect();

    // Seed as the owner (bypasses RLS by design) BEFORE forcing — an
    // owner-side seed write under FORCE with no app.venue_id set would be
    // rejected by each table's own *_isolation policy.
    await owner.query(
      `INSERT INTO venue_groups (id, name, slug, created_at) VALUES ($1, 'RLS Resolve Group A', $1, now())`,
      [groupAId]
    );
    await owner.query(
      `INSERT INTO venues (id, name, slug, iana_timezone, venue_group_id, updated_at)
       VALUES ($1, 'RLS Resolve Venue A', $2, 'UTC', $3, now())`,
      [venueAId, venueASlug, groupAId]
    );
    await owner.query(
      `INSERT INTO venues (id, name, slug, iana_timezone, updated_at)
       VALUES ($1, 'RLS Resolve Venue B', $1, 'UTC', now())`,
      [venueBId]
    );
    await owner.query(
      `INSERT INTO tables (id, venue_id, name, capacity, min_covers, updated_at)
       VALUES ($1, $2, 'RLS Resolve Table A', 4, 1, now())`,
      [tableAId, venueAId]
    );
    await owner.query(
      `INSERT INTO tables (id, venue_id, name, capacity, min_covers, updated_at)
       VALUES ($1, $2, 'RLS Resolve Table B', 4, 1, now())`,
      [tableBId, venueBId]
    );
    await owner.query(
      `INSERT INTO guests (id, venue_id, name, updated_at) VALUES ($1, $2, 'RLS Resolve Guest A', now())`,
      [guestAId, venueAId]
    );
    await owner.query(
      `INSERT INTO floor_plans (id, venue_id, name, is_active, layout_json, updated_at)
       VALUES ($1, $2, 'RLS Resolve Floor Plan A', true, '{}'::jsonb, now())`,
      [floorPlanAId, venueAId]
    );
    await owner.query(
      `INSERT INTO waitlist_entries
         (id, venue_id, party_size, guest_name, guest_phone, position, estimated_wait_minutes, updated_at)
       VALUES ($1, $2, 2, 'RLS Resolve Waitlist A', '+15550009999', 1, 10, now())`,
      [waitlistAId, venueAId]
    );
    await owner.query(
      `INSERT INTO reservations
         (id, venue_id, table_id, guest_id, user_id, date, start_time, end_time, party_size, updated_at)
       VALUES ($1, $2, $3, $4, $5, '2026-11-01', '2026-11-01T18:00:00Z', '2026-11-01T20:00:00Z', 2, now())`,
      [reservationAId, venueAId, tableAId, guestAId, reservationUserId]
    );
    // Second reservation for the SAME user at the SAME venue — proves
    // app_reservation_venue_ids_for_user's DISTINCT actually dedupes.
    await owner.query(
      `INSERT INTO reservations
         (id, venue_id, table_id, user_id, date, start_time, end_time, party_size, updated_at)
       VALUES ($1, $2, $3, $4, '2026-11-02', '2026-11-02T18:00:00Z', '2026-11-02T20:00:00Z', 2, now())`,
      [reservationA2Id, venueAId, tableAId, reservationUserId]
    );
    // Third reservation for the SAME user at a DIFFERENT venue — proves the
    // function returns every venue the user's reservations span, not just one.
    await owner.query(
      `INSERT INTO reservations
         (id, venue_id, table_id, user_id, date, start_time, end_time, party_size, updated_at)
       VALUES ($1, $2, $3, $4, '2026-11-03', '2026-11-03T18:00:00Z', '2026-11-03T20:00:00Z', 2, now())`,
      [reservationBId, venueBId, tableBId, reservationUserId]
    );
    await owner.query(
      `INSERT INTO deposits (id, reservation_id, amount_cents, currency, stripe_payment_intent_id, updated_at)
       VALUES ($1, $2, 5000, 'usd', $3, now())`,
      [depositAId, reservationAId, paymentIntentId]
    );

    // Force goes on AFTER seeding — the moment the resolver tests below
    // start, the OWNER connection is subject to RLS on ordinary queries too,
    // same as the sibling suites' pattern.
    await setForce(true);
  }, 30_000);

  afterAll(async () => {
    // Restore whatever the migrations declare, never a hardcoded state — if a
    // real FORCE migration has landed by the time this runs, leaving these
    // tables NO FORCE would silently undo it on the target database.
    await setForce(declaredForce.has("venues"));

    await owner.query("DELETE FROM deposits WHERE id = $1", [depositAId]);
    await owner.query("DELETE FROM reservations WHERE id = ANY($1)", [
      [reservationAId, reservationA2Id, reservationBId],
    ]);
    await owner.query("DELETE FROM waitlist_entries WHERE id = $1", [waitlistAId]);
    await owner.query("DELETE FROM floor_plans WHERE id = $1", [floorPlanAId]);
    await owner.query("DELETE FROM guests WHERE id = $1", [guestAId]);
    await owner.query("DELETE FROM tables WHERE id = ANY($1)", [[tableAId, tableBId]]);
    await owner.query("DELETE FROM venues WHERE id = ANY($1)", [[venueAId, venueBId]]);
    await owner.query("DELETE FROM venue_groups WHERE id = $1", [groupAId]);

    await probe.end();
    await owner.end();
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  }, 30_000);

  describe("app_resolve_venue_id", () => {
    it.each([
      ["reservation", () => reservationAId, () => venueAId],
      ["table", () => tableAId, () => venueAId],
      ["guest", () => guestAId, () => venueAId],
      ["floor_plan", () => floorPlanAId, () => venueAId],
      ["waitlist_entry", () => waitlistAId, () => venueAId],
      ["deposit", () => depositAId, () => venueAId],
      ["payment_intent", () => paymentIntentId, () => venueAId],
      ["venue", () => venueAId, () => venueAId],
      ["venue_slug", () => venueASlug, () => venueAId],
    ] as const)(
      "resolves the owning venue for kind=%s, THROUGH the admitting policy (owner-side ordinary reads are default-deny under FORCE)",
      async (kind, key, expectedVenueId) => {
        // Positive control: proves this suite's FORCE window is real — an
        // ordinary owner-side read with no app.venue_id set returns nothing.
        const ordinary = await owner.query("SELECT id FROM venues WHERE id = $1", [venueAId]);
        expect(ordinary.rows).toEqual([]);

        const { rows } = await owner.query<{ venue_id: string | null }>(
          "SELECT app_resolve_venue_id($1, $2) AS venue_id",
          [kind, key()]
        );
        expect(rows[0]?.venue_id).toBe(expectedVenueId());
      }
    );

    it("returns NULL when the key does not resolve to any row", async () => {
      const { rows } = await owner.query<{ venue_id: string | null }>(
        "SELECT app_resolve_venue_id('reservation', 'no-such-reservation') AS venue_id"
      );
      expect(rows[0]?.venue_id).toBeNull();
    });

    it("raises on an unrecognized kind instead of silently returning NULL", async () => {
      await expect(
        owner.query("SELECT app_resolve_venue_id('not-a-real-kind', $1)", [reservationAId])
      ).rejects.toThrow(/unknown kind/);
    });

    it("scopes venue/venue_slug lookups to a venue group when one is passed", async () => {
      const scoped = await owner.query<{ venue_id: string | null }>(
        "SELECT app_resolve_venue_id('venue_slug', $1, $2) AS venue_id",
        [venueASlug, groupAId]
      );
      expect(scoped.rows[0]?.venue_id).toBe(venueAId);

      const mismatched = await owner.query<{ venue_id: string | null }>(
        "SELECT app_resolve_venue_id('venue_slug', $1, $2) AS venue_id",
        [venueASlug, "no-such-group"]
      );
      expect(mismatched.rows[0]?.venue_id).toBeNull();

      const scopedById = await owner.query<{ venue_id: string | null }>(
        "SELECT app_resolve_venue_id('venue', $1, $2) AS venue_id",
        [venueAId, groupAId]
      );
      expect(scopedById.rows[0]?.venue_id).toBe(venueAId);
    });

    it("returns only a venue id — the SQL-level return type is a single scalar, not a row", async () => {
      const { rows, fields } = await owner.query(
        "SELECT app_resolve_venue_id('reservation', $1) AS venue_id",
        [reservationAId]
      );
      // A row-returning function would need `SELECT * FROM app_resolve_venue_id(...)`
      // and would report multiple columns; this reports exactly one.
      expect(fields).toHaveLength(1);
      expect(Object.keys(rows[0] ?? {})).toEqual(["venue_id"]);
    });
  });

  describe("app_reservation_venue_ids_for_user", () => {
    it("returns every distinct venue the user's reservations span", async () => {
      const { rows } = await owner.query<{ app_reservation_venue_ids_for_user: string }>(
        "SELECT * FROM app_reservation_venue_ids_for_user($1) ORDER BY 1",
        [reservationUserId]
      );
      expect(rows.map((row) => row.app_reservation_venue_ids_for_user)).toEqual(
        [venueAId, venueBId].sort()
      );
    });

    it("returns an empty set for a user with no reservations", async () => {
      const { rows } = await owner.query(
        "SELECT * FROM app_reservation_venue_ids_for_user('no-such-user')"
      );
      expect(rows).toEqual([]);
    });
  });

  describe("EXECUTE is revoked from PUBLIC", () => {
    it("a role granted only ordinary DML cannot call app_resolve_venue_id", async () => {
      await expect(
        probe.query("SELECT app_resolve_venue_id('reservation', $1)", [reservationAId])
      ).rejects.toThrow(/permission denied for function/);
    });

    it("a role granted only ordinary DML cannot call app_reservation_venue_ids_for_user", async () => {
      await expect(
        probe.query("SELECT * FROM app_reservation_venue_ids_for_user($1)", [reservationUserId])
      ).rejects.toThrow(/permission denied for function/);
    });
  });

  describe("the admitting policies are definer-only, not caller-forgeable", () => {
    it("a NON-OWNER that sets the marker itself still sees zero rows on every newly-guarded table", async () => {
      // Same shape as rls-isolation.integration.test.ts's proof for
      // venue_cross_venue_read: setting the marker is not enough on its own —
      // the second conjunct (pg_has_role against the table's real owner)
      // is what the SECURITY DEFINER function satisfies and a direct caller
      // cannot forge, whether or not FORCE is set.
      await probe.query("BEGIN");
      try {
        await probe.query("SELECT set_config('app.cross_venue', 'on', true)");
        for (const table of [
          "floor_plans",
          "tables",
          "guests",
          "reservations",
          "deposits",
          "waitlist_entries",
        ]) {
          const { rows } = await probe.query(`SELECT * FROM "${table}"`);
          expect(rows, `${table} admitted a non-owner via a self-set marker`).toEqual([]);
        }
      } finally {
        await probe.query("ROLLBACK");
      }
    });
  });

  describe("function metadata", () => {
    it("pins search_path and is SECURITY DEFINER on both functions", async () => {
      const { rows } = await owner.query<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
      }>(
        `SELECT proname, prosecdef, proconfig FROM pg_proc
          WHERE proname IN ('app_resolve_venue_id', 'app_reservation_venue_ids_for_user')
          ORDER BY proname`
      );

      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.prosecdef, `${row.proname} must be SECURITY DEFINER`).toBe(true);
        expect(row.proconfig, `${row.proname} must pin search_path`).toEqual(
          expect.arrayContaining([expect.stringContaining("search_path=")])
        );
      }
    });

    it("has an admitting cross_venue_read policy on all seven RLS tables", async () => {
      const { rows } = await owner.query<{ relname: string }>(
        `SELECT c.relname FROM pg_policy p
           JOIN pg_class c ON c.oid = p.polrelid
          WHERE p.polname LIKE '%cross_venue_read'
          ORDER BY c.relname`
      );
      expect(rows.map((row) => row.relname)).toEqual([...RLS_TABLES].sort());
    });
  });
});

/** Swaps the user/password in a Postgres connection string. */
function withRole(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}
