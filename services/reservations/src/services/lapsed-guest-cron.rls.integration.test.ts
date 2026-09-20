import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { findGuestsForVenue, getAllVenueIds } from "./lapsed-guest-cron.js";

/**
 * Real-Postgres regression test for ADR-026 §3's `app_rls_bypass` escape
 * hatch (issue #5401). Every other test touching this code path
 * (`rls-bypass.test.ts`, `lapsed-guest-cron.test.ts`) mocks Prisma, which
 * proves the wiring shape but cannot prove the RLS policies + bypass role
 * actually behave correctly against a real database.
 *
 * Deliberately does NOT reuse `DATABASE_URL`'s own role for the assertions:
 * Postgres skips every RLS policy for a table's OWNER (and for a
 * superuser) unconditionally, regardless of `app.venue_id` — and the role
 * that ran this service's migrations, which `DATABASE_URL` points at, is
 * exactly that owner. Testing through it would prove nothing about RLS and
 * would rediscover nothing if the bypass role/grants regressed (see the
 * separate, already-tracked #5369 for the "app's own connection role IS
 * the owner" gap this sidesteps rather than fixes). Instead this test
 * creates its own fresh, non-owner, non-superuser role — the same shape
 * this service's real connecting role is expected to have — and runs every
 * assertion through it.
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
  "lapsed-guest-cron RLS integration (ADR-026 §3 app_rls_bypass, issue #5401)",
  () => {
    const nonOwnerRole = `rls_it_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    // Generated per test run rather than hardcoded -- this role is
    // NOLOGIN-adjacent-but-not-quite (it does have LOGIN, scoped to this
    // test's own lifetime and dropped in afterAll), so no fixed password
    // literal should sit in a public repo even though it grants nothing
    // beyond this test's own throwaway fixture data.
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

      // A fresh, non-owner, non-superuser role — see the module doc comment
      // above for why testing through the owning connection would prove
      // nothing here.
      await ownerPrisma.$executeRawUnsafe(
        `CREATE ROLE "${nonOwnerRole}" LOGIN PASSWORD '${nonOwnerPassword}' IN ROLE app_rls_bypass`
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
      // USAGE grant and from the app_rls_bypass membership -- all three
      // must be revoked (in any order) before DROP ROLE will succeed.
      await ownerPrisma.$executeRawUnsafe(
        `REVOKE SELECT, INSERT ON "venues", "guests", "reservations" FROM "${nonOwnerRole}"`
      );
      await ownerPrisma.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM "${nonOwnerRole}"`);
      await ownerPrisma.$executeRawUnsafe(`REVOKE app_rls_bypass FROM "${nonOwnerRole}"`);
      await ownerPrisma.$executeRawUnsafe(`DROP ROLE IF EXISTS "${nonOwnerRole}"`);
      await ownerPrisma.$disconnect();
      await ownerPool.end();
    });

    it("baseline: a plain query as the non-owner role with no app.venue_id set sees zero guests (ADR-026 §4 default-deny)", async () => {
      const rows = await appPrisma.guest.findMany({ where: { venueId: venueA.id } });
      expect(rows).toEqual([]);
    });

    it("findGuestsForVenue (the cron's real read path) reads each venue's own guest across MULTIPLE venues under app_rls_bypass", async () => {
      const guestsA = await findGuestsForVenue(appPrisma, venueA.id);
      const guestsB = await findGuestsForVenue(appPrisma, venueB.id);

      expect(guestsA.map((g) => g.name)).toEqual(["RLS IT Guest A"]);
      expect(guestsB.map((g) => g.name)).toEqual(["RLS IT Guest B"]);
    });

    it("getAllVenueIds (the cron's venue-list read path) reads BOTH venues under app_rls_bypass, now that venues carries its own RLS policy", async () => {
      const venueIds = await getAllVenueIds(appPrisma);

      expect(venueIds).toEqual(expect.arrayContaining([venueA.id, venueB.id]));
    });

    it("SET LOCAL ROLE does not persist past the transaction — a later, non-bypassed query on the same pooled connection still sees zero rows under RLS", async () => {
      // Exercise the bypass first, so if `SET LOCAL ROLE` ever regressed to
      // a plain `SET ROLE` (which persists for the rest of the session,
      // not just the transaction), this would catch it: the next query
      // below reuses the pool and would silently keep seeing every venue's
      // guests instead of reverting to default-deny.
      await findGuestsForVenue(appPrisma, venueA.id);

      const rows = await appPrisma.guest.findMany({ where: { venueId: venueA.id } });
      expect(rows).toEqual([]);
    });
  }
);
