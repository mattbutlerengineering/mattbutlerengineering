import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabase } from "@mbe/database";
import { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";

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
 * owner unless the table also has `FORCE ROW LEVEL SECURITY`, which
 * ADR-026 deliberately does NOT set (see PR #5370's revert commit: forcing
 * it before every route reliably sets `app.venue_id` would 500 every
 * request that hits an RLS-protected table). Testing through the owner
 * role would therefore always return every row regardless of
 * `app.venue_id`, proving nothing about the policies themselves. A second,
 * ordinary role — granted only ordinary DML privileges, no BYPASSRLS, no
 * superuser, no ownership — is the only way to observe the policies
 * actually enforcing anything, matching the verification methodology
 * already recorded in PR #5370's own commit body.
 */
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
  let venueAId: string;
  let venueBId: string;
  let reservationAId: string;

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await ownerPrisma.deposit.deleteMany({ where: { reservationId: reservationAId } });
    await ownerPrisma.reservation.deleteMany({ where: { venueId: { in: [venueAId, venueBId] } } });
    await ownerPrisma.guest.deleteMany({ where: { venueId: { in: [venueAId, venueBId] } } });
    await ownerPrisma.table.deleteMany({ where: { venueId: { in: [venueAId, venueBId] } } });
    await ownerPrisma.venue.deleteMany({ where: { id: { in: [venueAId, venueBId] } } });
    await shutdownRestricted();
    await shutdownOwner();
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
});
