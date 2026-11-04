import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { floorPlanService } from "./floor-plan.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Real-Postgres proof for cloning a floor plan (#8255). Table names are unique
 * per venue (`tables_venue_id_name_key`), which a mocked Prisma never enforces,
 * so only a real database shows the clone colliding with its own source.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it.
 * Shares the FORCE-toggling suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;

describe.skipIf(!DATABASE_URL)("floor plan lifecycle (real Postgres)", () => {
  const venueId = `fp-lifecycle-it-${randomUUID()}`;
  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;

  function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  const asVenue = <T>(work: () => Promise<T>): Promise<T> => runWithVenueContext(venueId, work);

  async function planWithTables(name: string, tableNames: string[]): Promise<string> {
    return inVenue(async (tx) => {
      const plan = await tx.floorPlan.create({
        data: { venueId, name, isActive: false, layoutJson: { width: 800, height: 600 } },
      });
      for (const tableName of tableNames) {
        await tx.table.create({
          data: { venueId, floorPlanId: plan.id, name: tableName, capacity: 4 },
        });
      }
      return plan.id;
    });
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
    await inVenue((tx) =>
      tx.venue.create({
        data: { id: venueId, name: "Floor plan IT", slug: venueId, ianaTimezone: "UTC" },
      })
    );
  });

  afterAll(async () => {
    await inVenue(async (tx) => {
      await tx.reservationHold.deleteMany({ where: { table: { venueId } } });
      await tx.reservation.deleteMany({ where: { venueId } });
      await tx.table.deleteMany({ where: { venueId } });
      await tx.floorPlan.deleteMany({ where: { venueId } });
      await tx.venue.deleteMany({ where: { id: venueId } });
    });
    await client.$disconnect();
    await pool.end();
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  });

  describe("clone (#8255)", () => {
    it("copies every table under a venue-unique name, twice in a row", async () => {
      const sourceId = await planWithTables("Main", ["T1", "T2"]);

      const first = await asVenue(() => floorPlanService.clone(sourceId));
      const second = await asVenue(() => floorPlanService.clone(sourceId));

      expect(first?.isActive).toBe(false);
      expect(first?.tables?.map((t) => t.name).sort()).toEqual(["T1-2", "T2-2"]);
      expect(second?.tables?.map((t) => t.name).sort()).toEqual(["T1-3", "T2-3"]);
      expect(first?.name).not.toBe(second?.name);
    });
  });
});
