import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { findGuestsForVenue, getAllVenueIds } from "./lapsed-guest-cron.js";

/**
 * Real-Postgres regression test for issue #5401: the lapsed-guest cron
 * reading RLS-protected `guests` from a background interval with no HTTP
 * request context. The fix is per-venue `setVenueContext` (ADR-026 §4) —
 * each venue's scan opens its own transaction and sets `app.venue_id` to
 * that venue as the first statement. `lapsed-guest-cron.test.ts` proves that
 * wiring shape against a mock; only a real database can prove the RLS
 * policies then actually let the rows through.
 *
 * Deliberately does NOT reuse `DATABASE_URL`'s own role for the assertions:
 * Postgres skips every RLS policy for a table's OWNER unconditionally,
 * regardless of `app.venue_id` — and the role that ran this service's
 * migrations, which `DATABASE_URL` points at, is exactly that owner (no
 * table sets `FORCE ROW LEVEL SECURITY`). Testing through it would prove
 * nothing about the policies and would rediscover nothing if the venue
 * scoping regressed; it is also why #5401 is latent rather than live in
 * production today (tracked separately as #5369). Instead this test creates
 * its own fresh, non-owner, non-superuser role — the shape this service's
 * connecting role is eventually expected to have — and runs every assertion
 * through it.
 *
 * Requires a real, reachable Postgres at `DATABASE_URL` with this service's
 * migrations already applied (the `postgresql://test:test@localhost:5432/test`
 * convention CI's "Validate Migrations" job already uses). Skips loudly
 * (`describe.skipIf`, not a silent no-op) when `DATABASE_URL` is unset,
 * rather than reporting a hidden pass for a suite that never ran — the
 * "invisible spec" antipattern documented in
 * .claude/rules/gotchas.md#build--pnpm--turbo.
 */
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)(
  "lapsed-guest-cron RLS integration (ADR-026 §4 per-venue set_config, issue #5401)",
  () => {
    const nonOwnerRole = `rls_it_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    // Generated per test run rather than hardcoded -- this role has LOGIN,
    // scoped to this test's own lifetime and dropped in afterAll, so no fixed
    // password literal should sit in a public repo even though it grants
    // nothing beyond this test's own throwaway fixture data.
    const nonOwnerPassword = randomBytes(24).toString("hex");

    let ownerPool: pg.Pool;
    let ownerPrisma: PrismaClient;
    let appPool: pg.Pool;
    let appPrisma: PrismaClient;
    let venueA: { id: string };
    let venueB: { id: string };

    function connect(connectionString: string): [pg.Pool, PrismaClient] {
      const pool = new pg.Pool({ connectionString });
      return [pool, new PrismaClient({ adapter: new PrismaPg(pool) })];
    }

    beforeAll(async () => {
      [ownerPool, ownerPrisma] = connect(DATABASE_URL!);

      // A fresh, non-owner, non-superuser role with ordinary DML privileges
      // only -- deliberately no BYPASSRLS and no role membership granting it.
      // See the module doc comment above for why testing through the owning
      // connection would prove nothing here.
      await ownerPrisma.$executeRawUnsafe(
        `CREATE ROLE "${nonOwnerRole}" LOGIN PASSWORD '${nonOwnerPassword}'`
      );
      await ownerPrisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${nonOwnerRole}"`);
      await ownerPrisma.$executeRawUnsafe(
        `GRANT SELECT, INSERT ON "venues", "guests", "reservations" TO "${nonOwnerRole}"`
      );

      const appUrl = new URL(DATABASE_URL!);
      appUrl.username = nonOwnerRole;
      appUrl.password = nonOwnerPassword;
      [appPool, appPrisma] = connect(appUrl.toString());

      venueA = await ownerPrisma.venue.create({
        data: { name: "RLS IT Venue A", slug: `rls-it-a-${randomUUID()}`, ianaTimezone: "UTC" },
      });
      venueB = await ownerPrisma.venue.create({
        data: { name: "RLS IT Venue B", slug: `rls-it-b-${randomUUID()}`, ianaTimezone: "UTC" },
      });

      await ownerPrisma.guest.create({
        data: { venueId: venueA.id, name: "RLS IT Guest A", visitCount: 5, lastVisit: new Date() },
      });
      await ownerPrisma.guest.create({
        data: { venueId: venueB.id, name: "RLS IT Guest B", visitCount: 5, lastVisit: new Date() },
      });
    });

    afterAll(async () => {
      await appPrisma.$disconnect();
      await appPool.end();

      await ownerPrisma.guest.deleteMany({ where: { venueId: { in: [venueA.id, venueB.id] } } });
      await ownerPrisma.venue.deleteMany({ where: { id: { in: [venueA.id, venueB.id] } } });
      // Table-level grants are separate ACL entries from the schema-level
      // USAGE grant -- both must be revoked before DROP ROLE will succeed.
      await ownerPrisma.$executeRawUnsafe(
        `REVOKE SELECT, INSERT ON "venues", "guests", "reservations" FROM "${nonOwnerRole}"`
      );
      await ownerPrisma.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM "${nonOwnerRole}"`);
      await ownerPrisma.$executeRawUnsafe(`DROP ROLE IF EXISTS "${nonOwnerRole}"`);
      await ownerPrisma.$disconnect();
      await ownerPool.end();
    });

    it("baseline: a plain query as the non-owner role with no app.venue_id set sees zero guests (ADR-026 §4 default-deny)", async () => {
      const rows = await appPrisma.guest.findMany({ where: { venueId: venueA.id } });
      expect(rows).toEqual([]);
    });

    it("findGuestsForVenue (the cron's real read path) reads each venue's own guest across MULTIPLE venues", async () => {
      // The #5401 regression: before per-venue setVenueContext, both of these
      // came back empty for a non-owner role -- the cron silently scanning
      // nothing, for every venue.
      const guestsA = await findGuestsForVenue(appPrisma, venueA.id);
      const guestsB = await findGuestsForVenue(appPrisma, venueB.id);

      expect(guestsA.map((g) => g.name)).toEqual(["RLS IT Guest A"]);
      expect(guestsB.map((g) => g.name)).toEqual(["RLS IT Guest B"]);
    });

    it("each venue's scan sees ONLY its own venue, so the loop stays venue-scoped rather than bypassing RLS wholesale", async () => {
      // A blanket BYPASSRLS escape hatch would make every scan able to see
      // every venue's rows, with only the query's own `where` clause standing
      // between them. Per-venue set_config keeps the database itself as the
      // backstop: venue B's id is not visible from inside venue A's
      // transaction at all.
      const leaked = await appPrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueA.id}, true)`;
        return tx.guest.findMany({ where: { venueId: venueB.id } });
      });

      expect(leaked).toEqual([]);
    });

    it("getAllVenueIds is the ONE remaining cross-venue read: as a non-owner it sees zero venues (OPEN prerequisite, ADR-026 §3)", async () => {
      // NOT a desired behavior -- this pins a known, documented gap so it
      // cannot change silently. `venues`' RLS policy is keyed on each row's
      // own `id` (20260919000000_enable_rls_venues), so a query whose whole
      // purpose is to discover those ids has no single `app.venue_id` that
      // would make it correct. In production this still returns every venue,
      // because the service connects as the table owner and no table sets
      // FORCE ROW LEVEL SECURITY -- which is exactly why the cron is not
      // broken today. When that changes (FORCE lands, or #5369 moves the app
      // off the owner role), this assertion is what should force the
      // conversation instead of the cron quietly becoming a no-op.
      const venueIds = await getAllVenueIds(appPrisma);

      expect(venueIds).toEqual([]);
    });

    it("confirms the owner role still reads every venue, so the cron's venue list works in production today", async () => {
      // The other half of the assertion above: the gap is real but latent.
      const venueIds = await getAllVenueIds(ownerPrisma);

      expect(venueIds).toEqual(expect.arrayContaining([venueA.id, venueB.id]));
    });

    it("set_config(..., true) does not persist past its transaction — a later query on the same pooled connection is back to default-deny", async () => {
      // `is_local = true` gives set_config the same transaction scope as SET
      // LOCAL. If it ever regressed to a session-scoped setting, the next
      // query below would silently keep seeing venue A's guests after
      // reusing that pooled connection.
      await findGuestsForVenue(appPrisma, venueA.id);

      const rows = await appPrisma.guest.findMany({ where: { venueId: venueA.id } });
      expect(rows).toEqual([]);
    });
  }
);
