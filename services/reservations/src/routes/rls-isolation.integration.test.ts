import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { createDatabase } from "@mbe/database";
import { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { getAllVenueIds } from "../services/lapsed-guest-cron.js";
import { venueService } from "../services/venue.js";
import { db } from "../services/database.js";

/**
 * ADR-026 part 7/7: proves the Postgres RLS policies enabled in parts 2-4
 * (docs/adr/ADR-026-postgres-rls-venue-backstop.md) actually hold against a
 * real Postgres connection, with the application-level `where: { venueId }`
 * filter deliberately omitted from every query below.
 *
 * Requires a real, migrated Postgres database — set `DATABASE_URL` to run
 * it (e.g. `pnpm --dir services/reservations db:migrate:deploy` against a
 * scratch database first). Skips loudly, not silently, when unset: CI's
 * `test` job (`.github/workflows/ci.yml`) runs `vitest` with no Postgres
 * service attached (only the separate `migrations` job spins one up), so
 * this suite is expected to report as skipped there, never as passing on a
 * mock and never as a false failure.
 *
 * Every RLS-gated query below runs through a SEPARATE, ordinary (non-owner)
 * Postgres role provisioned ad hoc against the target database. This is
 * deliberate, not incidental: `services/reservations` connects to Postgres
 * with the SAME role that ran `prisma migrate deploy` (`DATABASE_URL`),
 * which OWNS these tables — and Postgres does not apply RLS to a table's
 * owner unless the table also has `FORCE ROW LEVEL SECURITY` (#5369).
 * Testing only through the owner role would therefore return every row
 * regardless of `app.venue_id`, proving nothing about the policies
 * themselves. A second, ordinary role — granted only ordinary DML
 * privileges, no BYPASSRLS, no superuser, no ownership — is the only way to
 * observe the policies actually enforcing anything.
 *
 * **This suite enables `FORCE ROW LEVEL SECURITY` on all seven ADR-026 tables
 * for its own duration** (after seeding, since owner-side seed writes are
 * themselves subject to RLS under FORCE) and disables it again in `afterAll`.
 * No migration in this repo sets FORCE — that flip is a separate, reviewed
 * change, gated on the audit in #5369. Enabling it *here* is what makes the
 * `venue_cross_venue_read` assertions below mean anything: without FORCE the
 * escape hatch reads every venue through plain owner-bypass, so a broken
 * policy would look identical to a working one.
 *
 * FORCE is per-table cluster state, shared by every connection to the target
 * database, so this suite serialises itself against the sibling real-Postgres
 * suite (`../services/lapsed-guest-cron.rls.integration.test.ts`) with the
 * advisory lock below. Vitest runs test FILES in parallel workers, and without
 * that lock the sibling's owner-side seed writes land inside this window and
 * are rejected — measured, `42501 new row violates row-level security policy
 * for table "guests"` on roughly one run in ten.
 */

/**
 * Advisory-lock key (the issue number) held for as long as either
 * real-Postgres suite is touching the ADR-026 tables. Both suites must use the
 * same value; see the doc comment above for what interleaving costs.
 *
 * Held on a DEDICATED `pg.Client`, not through Prisma: `pg_advisory_lock` is
 * session-scoped, and Prisma's pool hands out an arbitrary connection per
 * query, so a lock taken through it could be released on a different session
 * than it was taken on — i.e. never released at all.
 */
const RLS_SUITE_LOCK_KEY = 5369;

async function acquireRlsSuiteLock(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);
  return client;
}

async function releaseRlsSuiteLock(client: pg.Client): Promise<void> {
  await client.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
  await client.end();
}

/** The seven tables ADR-026 §1 puts under RLS, in the order its §5 lists them. */
const RLS_TABLES = [
  "venues",
  "floor_plans",
  "tables",
  "guests",
  "reservations",
  "deposits",
  "waitlist_entries",
] as const;
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_TEST_ROLE = "rls_isolation_test_role";
const RLS_TEST_PASSWORD = "rls_isolation_test_password";

/** Swaps the user/password in a Postgres connection string. */
function withRole(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}

describe.skipIf(!DATABASE_URL)("RLS cross-tenant isolation backstop (ADR-026)", () => {
  // Constructed inside beforeAll (not at describe-body scope): vitest still
  // evaluates a skipIf'd describe body during collection, only the
  // individual tests/hooks themselves are skipped — so anything here that
  // dereferences the (possibly-undefined) DATABASE_URL must live in a hook.
  //
  // Cast the same way `../services/database.ts` casts `db.prisma` — the
  // shared `createDatabase<T extends PrismaLike>` helper's `PrismaLike`
  // constraint is deliberately minimal (it must also accept the mock used
  // in unit tests), so real model-delegate access needs this one cast.
  let ownerPrisma: PrismaClient;
  let restrictedPrisma: PrismaClient;
  let shutdownOwner: () => Promise<void>;
  let shutdownRestricted: () => Promise<void>;
  let lockClient: pg.Client;
  let venueAId: string;
  let venueBId: string;
  let reservationAId: string;

  beforeAll(async () => {
    lockClient = await acquireRlsSuiteLock(DATABASE_URL as string);

    const ownerDb = createDatabase(PrismaClient as never, DATABASE_URL);
    const restrictedDb = createDatabase(
      PrismaClient as never,
      withRole(DATABASE_URL as string, RLS_TEST_ROLE, RLS_TEST_PASSWORD)
    );
    ownerPrisma = ownerDb.prisma as unknown as PrismaClient;
    restrictedPrisma = restrictedDb.prisma as unknown as PrismaClient;
    shutdownOwner = ownerDb.shutdown;
    shutdownRestricted = restrictedDb.shutdown;

    // Idempotent role provisioning against a persistent test database —
    // ordinary DML privileges only, deliberately no BYPASSRLS/superuser.
    await ownerPrisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN
          CREATE ROLE ${RLS_TEST_ROLE} LOGIN PASSWORD '${RLS_TEST_PASSWORD}';
        END IF;
      END
      $$;
    `);
    await ownerPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`
    );
    // ADR-026 §3's cross-venue escape hatch revokes EXECUTE from PUBLIC, so a
    // non-owner needs it granted explicitly — the same GRANT whichever change
    // moves the service onto a non-owner role will have to issue.
    await ownerPrisma.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION app_cross_venue_venues(text) TO ${RLS_TEST_ROLE}`
    );

    // Seed cross-tenant fixtures as the owner role (bypasses RLS by design).
    const venueA = await ownerPrisma.venue.create({
      data: { name: "RLS Test Venue A", slug: `rls-venue-a-${Date.now()}`, ianaTimezone: "UTC" },
    });
    const venueB = await ownerPrisma.venue.create({
      data: { name: "RLS Test Venue B", slug: `rls-venue-b-${Date.now()}`, ianaTimezone: "UTC" },
    });
    venueAId = venueA.id;
    venueBId = venueB.id;

    const tableA = await ownerPrisma.table.create({
      data: { name: "RLS Test Table", capacity: 4, venueId: venueAId },
    });
    await ownerPrisma.guest.create({
      data: { venueId: venueAId, name: "RLS Test Guest A" },
    });
    const reservationA = await ownerPrisma.reservation.create({
      data: {
        date: new Date("2026-10-01"),
        startTime: new Date("2026-10-01T18:00:00Z"),
        endTime: new Date("2026-10-01T20:00:00Z"),
        partySize: 2,
        tableId: tableA.id,
        venueId: venueAId,
      },
    });
    reservationAId = reservationA.id;
    await ownerPrisma.deposit.create({
      data: { reservationId: reservationAId, amountCents: 5000 },
    });

    // Seeding is done, so the owner can stop being exempt. Everything below
    // this line runs with the backstop actually engaged for every role.
    for (const table of RLS_TABLES) {
      await ownerPrisma.$executeRawUnsafe(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    }
  });

  afterAll(async () => {
    // Undo FORCE before the owner-side cleanup below: under FORCE those
    // DELETEs are themselves policy-checked and would silently remove nothing.
    for (const table of RLS_TABLES) {
      await ownerPrisma.$executeRawUnsafe(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
    }

    await ownerPrisma.deposit.deleteMany({ where: { reservationId: reservationAId } });
    await ownerPrisma.reservation.deleteMany({ where: { venueId: { in: [venueAId, venueBId] } } });
    await ownerPrisma.guest.deleteMany({ where: { venueId: { in: [venueAId, venueBId] } } });
    await ownerPrisma.table.deleteMany({ where: { venueId: { in: [venueAId, venueBId] } } });
    await ownerPrisma.venue.deleteMany({ where: { id: { in: [venueAId, venueBId] } } });
    await shutdownRestricted();
    await shutdownOwner();
    // The module singleton the `venueService` assertions go through opens its
    // own pool from `DATABASE_URL`; close it or vitest hangs on the handle.
    await db.shutdown();
    await releaseRlsSuiteLock(lockClient);
  });

  it("returns zero reservation rows for Venue A's data when app.venue_id is set to Venue B, with no app-level venueId filter", async () => {
    const rows = await restrictedPrisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueBId);
      // Deliberately no `where: { venueId }` — proving RLS alone, not the
      // application filter it backstops, is what keeps this at zero rows.
      return tx.reservation.findMany();
    });

    expect(rows).toEqual([]);
  });

  it("returns Venue A's reservation when app.venue_id is set to Venue A (positive control)", async () => {
    const rows = await restrictedPrisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueAId);
      return tx.reservation.findMany();
    });

    expect(rows.map((r) => r.id)).toEqual([reservationAId]);
  });

  it("returns zero rows for any table when app.venue_id is never set (default-deny)", async () => {
    const rows = await restrictedPrisma.reservation.findMany();

    expect(rows).toEqual([]);
  });

  it("returns zero guest rows for Venue A's data when app.venue_id is set to Venue B", async () => {
    const rows = await restrictedPrisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueBId);
      return tx.guest.findMany();
    });

    expect(rows).toEqual([]);
  });

  it("returns Venue A's guest when app.venue_id is set to Venue A (positive control)", async () => {
    const rows = await restrictedPrisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueAId);
      return tx.guest.findMany();
    });

    expect(rows).toHaveLength(1);
  });

  it("returns zero deposit rows for Venue A's reservation when app.venue_id is set to Venue B (join-based policy)", async () => {
    const rows = await restrictedPrisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueBId);
      // No `where` at all — the deposit_isolation policy joins through
      // reservations.venue_id (ADR-026 §5) since deposits carries no
      // venue_id column of its own.
      return tx.deposit.findMany();
    });

    expect(rows).toEqual([]);
  });

  it("returns Venue A's deposit when app.venue_id is set to Venue A (positive control for the join-based policy)", async () => {
    const rows = await restrictedPrisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueAId);
      return tx.deposit.findMany();
    });

    expect(rows.map((d) => d.reservationId)).toEqual([reservationAId]);
  });

  // `venues` has no separate venue_id column -- the row's own id IS the
  // venue identifier (ADR-026 §5's venue_isolation policy). A cross-tenant
  // query therefore can't assert "zero rows" against the whole table (Venue
  // B's own row always matches its own id); the isolation assertion instead
  // proves Venue A's row is invisible while Venue B's own row is still
  // visible under Venue B's session context.
  it("does not return Venue A's row when app.venue_id is set to Venue B, with no app-level id filter (cross-tenant isolation)", async () => {
    const rows = await restrictedPrisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueBId);
      return tx.venue.findMany();
    });

    expect(rows.map((v) => v.id)).toEqual([venueBId]);
  });

  it("returns Venue A's own row when app.venue_id is set to Venue A (positive control)", async () => {
    const rows = await restrictedPrisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueAId);
      return tx.venue.findMany();
    });

    expect(rows.map((v) => v.id)).toEqual([venueAId]);
  });

  it("returns zero venue rows when app.venue_id is never set (default-deny)", async () => {
    const rows = await restrictedPrisma.venue.findMany();

    expect(rows).toEqual([]);
  });

  /**
   * ADR-026 §3's two cross-venue reads, under the conditions that make them
   * mean something: `FORCE ROW LEVEL SECURITY` on, queried by a role that does
   * not own the tables (issue #5369). Without FORCE every assertion here would
   * pass through plain owner-bypass and prove nothing.
   */
  describe("cross-venue escape hatch (app_cross_venue_venues, #5369)", () => {
    it("has FORCE ROW LEVEL SECURITY enabled on all seven ADR-026 tables for this suite", async () => {
      // Guard against the whole block silently degrading into an
      // owner-bypass no-op if the beforeAll FORCE loop ever stops running.
      const rows = await ownerPrisma.$queryRawUnsafe<
        { relname: string; relforcerowsecurity: boolean }[]
      >(
        // Scoped to ordinary public tables: `information_schema` also owns a
        // view called `tables`, which would otherwise join this result.
        `SELECT relname, relforcerowsecurity FROM pg_class
         WHERE relname = ANY($1)
           AND relkind = 'r'
           AND relnamespace = 'public'::regnamespace
         ORDER BY relname`,
        [...RLS_TABLES]
      );

      expect(rows).toHaveLength(RLS_TABLES.length);
      expect(rows.filter((row) => !row.relforcerowsecurity)).toEqual([]);
    });

    it("makes even the OWNER default-deny, which is the whole point of the flip", async () => {
      // The measured shape of #5369: with FORCE absent this returns every
      // venue for the owning role no matter what app.venue_id says, which is
      // why the backstop is inert in production today.
      const rows = await ownerPrisma.venue.findMany();

      expect(rows).toEqual([]);
    });

    it("reads every venue for a NON-OWNER through the escape hatch", async () => {
      const rows = await restrictedPrisma.$queryRawUnsafe<{ id: string }[]>(
        "SELECT id FROM app_cross_venue_venues()"
      );

      expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining([venueAId, venueBId]));
    });

    it("scopes the hatch by venue group when one is passed (venueService.list's filter)", async () => {
      const rows = await restrictedPrisma.$queryRawUnsafe<{ id: string }[]>(
        "SELECT id FROM app_cross_venue_venues($1::text)",
        "no-such-group"
      );

      expect(rows).toEqual([]);
    });

    it("reads every venue for the cron's real call path (getAllVenueIds) as a NON-OWNER", async () => {
      const venueIds = await getAllVenueIds(restrictedPrisma);

      expect(venueIds).toEqual(expect.arrayContaining([venueAId, venueBId]));
    });

    it("runs venueService.list's own SQL against real Postgres under FORCE", async () => {
      // `venue.test.ts` mocks `$queryRaw`, so nothing there would catch a typo,
      // a wrong column alias or a bad cast in the admin list's hand-written
      // query. This executes it — through the module singleton, i.e. the same
      // connection and the same deployed role the service itself uses.
      const result = await venueService.list(1, 100);

      expect(result.data.map((venue) => venue.id)).toEqual(
        expect.arrayContaining([venueAId, venueBId])
      );
      expect(result.pagination.total).toBeGreaterThanOrEqual(2);

      const venueA = result.data.find((venue) => venue.id === venueAId);
      // Proves the join and the snake_case → camelCase re-shape, not just the
      // row count: an aliased column that failed to land would read undefined.
      expect(venueA?.name).toBe("RLS Test Venue A");
      expect(venueA?.ianaTimezone).toBe("UTC");
      expect(typeof venueA?.createdAt).toBe("string");
    });

    it("applies venueService.list's venue-group filter in real SQL", async () => {
      const result = await venueService.list(1, 100, "no-such-group");

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it("does not admit a NON-OWNER that sets the marker itself — the hatch is definer-only", async () => {
      // The second conjunct of `venue_cross_venue_read`: a role that is not
      // (a member of) the table's owner cannot forge its way in, so once the
      // service stops connecting as the owner, `app_cross_venue_venues` is the
      // only path. Today the app IS the owner, so this is the property that
      // arrives for free with that change rather than one holding now.
      const rows = await restrictedPrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.cross_venue', 'on', true)`;
        return tx.venue.findMany();
      });

      expect(rows).toEqual([]);
    });

    it("does not leave the marker set for a later query on the same connection", async () => {
      await restrictedPrisma.$queryRawUnsafe("SELECT id FROM app_cross_venue_venues()");

      const rows = await restrictedPrisma.venue.findMany();

      expect(rows).toEqual([]);
    });

    it("does not admit a cross-venue WRITE, even for the owner with the marker set", async () => {
      // The admitting policy is FOR SELECT only, so `venue_isolation` is still
      // the only policy governing writes — an escape hatch that could write
      // would reopen exactly the hole ADR-026 exists to close.
      const updated = await ownerPrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.cross_venue', 'on', true)`;
        return tx.venue.updateMany({ data: { currencyCode: "EUR" } });
      });

      expect(updated.count).toBe(0);
    });
  });
});
