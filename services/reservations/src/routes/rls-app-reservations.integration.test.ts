import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createDatabase } from "@mbe/database";
import { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { db, prisma } from "../services/database.js";
import { runWithVenueContext } from "../services/venue-context-store.js";
import { withVenueScopedQueries } from "../services/venue-scoped-prisma.js";

/**
 * Issue #5369: the durable `app_reservations` session, assumed with
 * `SET LOCAL ROLE` on the owner connection. The throwaway LOGIN probe in
 * `./rls-isolation.integration.test.ts` stays and is not this role.
 *
 * After the role switch, a read of venue A with `app.venue_id` set to venue B
 * returns no venue A row. Setting `app.cross_venue = 'on'` in that same
 * session and reading `venues` directly still returns no row. The three
 * resolver functions return the rows they are defined to return, which is
 * what `GRANT EXECUTE` is for. `pg_has_role('app_reservations', relowner,
 * 'MEMBER')` is false for the seven venue tables — the app role is not a
 * member of the owner.
 *
 * The "service's real connection path" block below (#5369 AC3) never writes
 * `SET LOCAL ROLE` by hand. It drives the service's own `prisma` export
 * (`../services/database.ts`, connected with `DATABASE_URL`) through
 * `setVenueContext` and the `withVenueScopedQueries` auto-wrap, with
 * `app.cross_venue = 'on'` forged. Under FORCE the owner is already subject
 * to the venue policies, so a plain cross-venue read cannot tell the role
 * switch apart from its absence. The forged marker can: the
 * `*_cross_venue_read` policies admit it for a member of the table owner
 * only. Measured 2026-10-10: with `assumeAppRole` stubbed to a no-op, all six
 * RLS suites CI runs still passed (155 tests); these tests fail.
 *
 * Skips when `DATABASE_URL` is unset. CI's `test` job has no Postgres; the
 * `rls-integration` job in `.github/workflows/ci.yml` runs this file against
 * a non-superuser owner role. Shares `pg_advisory_lock` key 5369 with the
 * suites that toggle FORCE.
 */

/** Same credentials, with a session-level `app.cross_venue = 'on'` forged in. */
function withForgedCrossVenueMarker(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c app.cross_venue=on");
  return parsed.toString();
}

const DATABASE_URL = process.env.DATABASE_URL;

const RLS_SUITE_LOCK_KEY = 5369;

const RLS_TABLES = [
  "venues",
  "floor_plans",
  "tables",
  "guests",
  "reservations",
  "deposits",
  "waitlist_entries",
] as const;

describe.skipIf(!DATABASE_URL)("RLS as app_reservations (#5369)", () => {
  const venueAId = `rls-app-a-${randomUUID()}`;
  const venueBId = `rls-app-b-${randomUUID()}`;
  const tableAId = `rls-app-table-a-${randomUUID()}`;
  const reservationAId = `rls-app-res-a-${randomUUID()}`;
  const userId = `rls-app-user-${randomUUID()}`;

  let lockClient: pg.Client;
  let app: pg.Client;

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

  /** Owner connection, role assumed for this transaction only. */
  async function asAppRole<T>(work: () => Promise<T>): Promise<T> {
    await app.query("BEGIN");
    try {
      await app.query('SET LOCAL ROLE "app_reservations"');
      const result = await work();
      await app.query("COMMIT");
      return result;
    } catch (error) {
      await app.query("ROLLBACK");
      throw error;
    }
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    app = new pg.Client({ connectionString: DATABASE_URL });
    await app.connect();

    for (const id of [venueAId, venueBId]) {
      await inVenue(id, async () => {
        await app.query(
          `INSERT INTO venues (id, name, slug, iana_timezone, updated_at)
           VALUES ($1, $2, $3, 'UTC', now())`,
          [id, `RLS App ${id}`, id]
        );
      });
    }

    await inVenue(venueAId, async () => {
      await app.query(
        `INSERT INTO tables (id, venue_id, name, capacity, updated_at)
         VALUES ($1, $2, 'RLS App Table A', 4, now())`,
        [tableAId, venueAId]
      );
      await app.query(
        `INSERT INTO reservations
           (id, venue_id, table_id, user_id, date, start_time, end_time, party_size, updated_at)
         VALUES ($1, $2, $3, $4, '2026-11-01', '2026-11-01T18:00:00Z', '2026-11-01T20:00:00Z', 2, now())`,
        [reservationAId, venueAId, tableAId, userId]
      );
    });
  });

  afterAll(async () => {
    await inVenue(venueAId, async () => {
      await app.query("DELETE FROM reservations WHERE id = $1", [reservationAId]);
      await app.query("DELETE FROM tables WHERE id = $1", [tableAId]);
      await app.query("DELETE FROM venues WHERE id = $1", [venueAId]);
    });
    await inVenue(venueBId, async () => {
      await app.query("DELETE FROM venues WHERE id = $1", [venueBId]);
    });

    await app.end();
    // The service singleton opens its own pool from DATABASE_URL.
    await db.shutdown();
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  });

  it("is not a member of the table owner on the seven venue tables", async () => {
    const { rows } = await app.query<{ relname: string; member: boolean }>(
      `SELECT c.relname,
              pg_catalog.pg_has_role('app_reservations', c.relowner, 'MEMBER') AS member
         FROM pg_catalog.pg_class c
        WHERE c.relname = ANY($1)
          AND c.relkind = 'r'
          AND c.relnamespace = 'public'::regnamespace
        ORDER BY c.relname`,
      [[...RLS_TABLES]]
    );

    expect(rows.map((row) => row.relname)).toEqual([...RLS_TABLES].sort());
    expect(rows.filter((row) => row.member)).toEqual([]);
  });

  it("hides venue A when app_reservations has app.venue_id set to venue B", async () => {
    const ids = await asAppRole(async () => {
      const who = await app.query<{ current_user: string }>("SELECT current_user");
      expect(who.rows[0]?.current_user).toBe("app_reservations");
      await app.query("SELECT set_config('app.venue_id', $1, true)", [venueBId]);
      const { rows } = await app.query<{ id: string }>(
        "SELECT id FROM venues WHERE id = ANY($1) ORDER BY id",
        [[venueAId, venueBId]]
      );
      return rows.map((row) => row.id);
    });

    expect(ids).toEqual([venueBId]);
  });

  it("still returns no venue row when app_reservations sets app.cross_venue itself", async () => {
    const ids = await asAppRole(async () => {
      await app.query("SELECT set_config('app.cross_venue', 'on', true)");
      const { rows } = await app.query<{ id: string }>(
        "SELECT id FROM venues WHERE id = ANY($1) ORDER BY id",
        [[venueAId, venueBId]]
      );
      return rows.map((row) => row.id);
    });

    expect(ids).toEqual([]);
  });

  it("returns the defined rows from the three resolver functions", async () => {
    const found = await asAppRole(async () => {
      const crossVenue = await app.query<{ id: string }>(
        "SELECT id FROM app_cross_venue_venues(NULL) WHERE id = ANY($1) ORDER BY id",
        [[venueAId, venueBId]]
      );
      const resolved = await app.query<{ venue_id: string | null }>(
        "SELECT app_resolve_venue_id($1, $2, $3) AS venue_id",
        ["venue", venueAId, null]
      );
      const forUser = await app.query<{ venue_id: string }>(
        "SELECT app_reservation_venue_ids_for_user($1) AS venue_id",
        [userId]
      );
      return {
        crossVenue: crossVenue.rows.map((row) => row.id),
        resolved: resolved.rows[0]?.venue_id,
        forUser: forUser.rows.map((row) => row.venue_id),
      };
    });

    expect(found.crossVenue).toEqual([venueAId, venueBId].sort());
    expect(found.resolved).toBe(venueAId);
    expect(found.forUser).toEqual([venueAId]);
  });

  describe("through the service's real connection path (#5369 AC3)", () => {
    const bothVenues = () => ({ id: { in: [venueAId, venueBId] } });

    it("runs an explicit app transaction as app_reservations and ignores a forged marker", async () => {
      const seen = await prisma.$transaction(async (tx) => {
        await setVenueContext(tx, venueBId);
        await tx.$executeRaw`SELECT set_config('app.cross_venue', 'on', true)`;
        const who = await tx.$queryRaw<{ current_user: string }[]>`SELECT current_user`;
        const venues = await tx.venue.findMany({
          where: bothVenues(),
          select: { id: true },
          orderBy: { id: "asc" },
        });
        return { user: who[0]?.current_user, ids: venues.map((venue) => venue.id) };
      });

      expect(seen).toEqual({ user: "app_reservations", ids: [venueBId] });
    });

    describe("auto-wrapped delegate calls on a session with the marker forged", () => {
      let forged: ReturnType<typeof createDatabase>;
      let forgedPrisma: PrismaClient;

      beforeAll(() => {
        forged = createDatabase(
          PrismaClient as never,
          withForgedCrossVenueMarker(DATABASE_URL as string)
        );
        forgedPrisma = forged.prisma as unknown as PrismaClient;
      });

      afterAll(async () => {
        await forged.shutdown();
      });

      it("really forges the marker on the session (guards against a vacuous pass)", async () => {
        const rows = await forgedPrisma.$queryRaw<
          { marker: string | null }[]
        >`SELECT current_setting('app.cross_venue', true) AS marker`;

        expect(rows[0]?.marker).toBe("on");
      });

      it("still sees only the context venue, because the wrap assumes app_reservations", async () => {
        const scoped = withVenueScopedQueries(forgedPrisma);
        const venues = await runWithVenueContext(venueBId, () =>
          scoped.venue.findMany({
            where: bothVenues(),
            select: { id: true },
            orderBy: { id: "asc" },
          })
        );

        expect(venues.map((venue) => venue.id)).toEqual([venueBId]);
      });
    });
  });
});
