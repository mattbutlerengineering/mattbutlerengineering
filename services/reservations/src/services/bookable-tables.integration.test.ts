import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { loadAvailabilitySnapshot } from "./availability-snapshot.js";
import { floorPlanService } from "./floor-plan.js";
import { runWithVenueContext } from "./venue-context-store.js";
import { withVenueScopedQueries } from "./venue-scoped-prisma.js";

/**
 * Real-Postgres proof that table bookability follows the venue's active floor
 * plan (#8276). The rule lives in a Prisma relation filter
 * (`bookableTableWhere`), which a mocked client never evaluates.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it.
 * Shares the FORCE-toggling suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;

describe.skipIf(!DATABASE_URL)(
  "bookable tables follow the active floor plan (real Postgres)",
  () => {
    const venueId = `bookable-it-${randomUUID()}`;
    const now = new Date("2026-11-01T12:00:00Z");
    let lockClient: pg.Client;
    let pool: pg.Pool;
    let client: PrismaClient;
    let scoped: PrismaClient;

    function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
        return work(tx as unknown as PrismaClient);
      });
    }

    const asVenue = <T>(work: () => Promise<T>): Promise<T> => runWithVenueContext(venueId, work);

    async function planWithTables(
      name: string,
      tableNames: string[],
      isActive: boolean
    ): Promise<{ planId: string; tableIds: string[] }> {
      return inVenue(async (tx) => {
        const plan = await tx.floorPlan.create({
          data: { venueId, name, isActive, layoutJson: { width: 800, height: 600 } },
        });
        const tableIds: string[] = [];
        for (const tableName of tableNames) {
          const table = await tx.table.create({
            data: { venueId, floorPlanId: plan.id, name: tableName, capacity: 4 },
          });
          tableIds.push(table.id);
        }
        return { planId: plan.id, tableIds };
      });
    }

    async function bookableIds(): Promise<string[]> {
      const loaded = await asVenue(() =>
        loadAvailabilitySnapshot(venueId, "2026-11-05", "2026-11-05", now, { db: scoped })
      );
      return loaded.snapshot.tables.map((t) => t.id).sort();
    }

    let a: { planId: string; tableIds: string[] };
    let b: { planId: string; tableIds: string[] };

    beforeAll(async () => {
      lockClient = new pg.Client({ connectionString: DATABASE_URL! });
      await lockClient.connect();
      await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

      pool = new pg.Pool({ connectionString: DATABASE_URL! });
      client = new PrismaClient({ adapter: new PrismaPg(pool) });
      scoped = withVenueScopedQueries(client);
      await inVenue((tx) =>
        tx.venue.create({
          data: { id: venueId, name: "Bookable IT", slug: venueId, ianaTimezone: "UTC" },
        })
      );
      a = await planWithTables("Plan A", ["A1"], true);
      b = await planWithTables("Plan B", ["B1"], false);
    });

    afterAll(async () => {
      await inVenue(async (tx) => {
        await tx.table.deleteMany({ where: { venueId } });
        await tx.floorPlan.deleteMany({ where: { venueId } });
        await tx.venue.deleteMany({ where: { id: venueId } });
      });
      await client.$disconnect();
      await pool.end();
      await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
      await lockClient.end();
    });

    it("offers only the active plan's tables", async () => {
      expect(await bookableIds()).toEqual(a.tableIds);
    });

    it("moves bookability to the other plan when it is activated", async () => {
      await asVenue(() => floorPlanService.setActive(b.planId, venueId));
      expect(await bookableIds()).toEqual(b.tableIds);
    });

    it("keeps plan-less tables bookable alongside the active plan", async () => {
      const loose = await inVenue((tx) =>
        tx.table.create({ data: { venueId, name: "Loose", capacity: 2 } })
      );
      expect(await bookableIds()).toEqual([...b.tableIds, loose.id].sort());
    });

    it("offers every active table when the venue has no active plan", async () => {
      await inVenue((tx) =>
        tx.floorPlan.updateMany({ where: { venueId }, data: { isActive: false } })
      );
      const all = await inVenue((tx) =>
        tx.table.findMany({ where: { venueId, isActive: true }, select: { id: true } })
      );
      expect(await bookableIds()).toEqual(all.map((t) => t.id).sort());
      expect(all.length).toBe(3);
    });
  }
);
