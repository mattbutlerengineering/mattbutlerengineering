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

  async function planWithTables(
    name: string,
    tableNames: string[],
    isActive = false
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

  const at = (iso: string) => new Date(iso);

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
      const { planId: sourceId } = await planWithTables("Main", ["T1", "T2"]);

      const first = await asVenue(() => floorPlanService.clone(sourceId));
      const second = await asVenue(() => floorPlanService.clone(sourceId));

      expect(first?.isActive).toBe(false);
      expect(first?.tables?.map((t) => t.name).sort()).toEqual(["T1-2", "T2-2"]);
      expect(second?.tables?.map((t) => t.name).sort()).toEqual(["T1-3", "T2-3"]);
      expect(first?.name).not.toBe(second?.name);
    });
  });

  describe("delete (#8254)", () => {
    it("hard-deletes a plan whose tables were never booked or held", async () => {
      const { planId, tableIds } = await planWithTables("Unbooked", ["U1", "U2"]);

      expect(await asVenue(() => floorPlanService.delete(planId))).toBe("deleted");

      const left = await inVenue(async (tx) => ({
        plan: await tx.floorPlan.findUnique({ where: { id: planId } }),
        tables: await tx.table.count({ where: { id: { in: tableIds } } }),
      }));
      expect(left).toEqual({ plan: null, tables: 0 });
    });

    it("archives a plan with booking history, keeping every reservation and hold", async () => {
      const { planId, tableIds } = await planWithTables("Old patio", ["P1", "P2"]);
      const [booked, held] = tableIds as [string, string];
      const { reservationId, holdId } = await inVenue(async (tx) => {
        const reservation = await tx.reservation.create({
          data: {
            venueId,
            tableId: booked,
            date: at("2026-10-01T00:00:00Z"),
            startTime: at("2026-10-01T19:00:00Z"),
            endTime: at("2026-10-01T20:30:00Z"),
            partySize: 2,
            status: "CANCELLED",
            guestName: "Ana",
          },
        });
        const hold = await tx.reservationHold.create({
          data: {
            venueId,
            tableId: held,
            date: at("2026-10-02T00:00:00Z"),
            startTime: at("2026-10-02T19:00:00Z"),
            endTime: at("2026-10-02T20:30:00Z"),
            partySize: 2,
            sessionId: "s-1",
            expiresAt: at("2026-10-01T00:00:00Z"),
          },
        });
        return { reservationId: reservation.id, holdId: hold.id };
      });

      expect(await asVenue(() => floorPlanService.delete(planId))).toBe("archived");

      const after = await inVenue(async (tx) => ({
        reservation: await tx.reservation.findUnique({ where: { id: reservationId } }),
        hold: await tx.reservationHold.findUnique({ where: { id: holdId } }),
        tables: await tx.table.findMany({
          where: { id: { in: tableIds } },
          orderBy: { name: "asc" },
        }),
      }));
      expect(after.reservation?.tableId).toBe(booked);
      expect(after.hold?.tableId).toBe(held);
      // Out of service, and their names are free for the venue's next plan.
      expect(after.tables.map((t) => [t.name, t.isActive])).toEqual([
        ["P1 (archived)", false],
        ["P2 (archived)", false],
      ]);

      // Gone from every read, and cannot be revived through activate or clone.
      const list = await asVenue(() => floorPlanService.list(1, 100, venueId));
      expect(list.data.map((p) => p.id)).not.toContain(planId);
      expect(await asVenue(() => floorPlanService.getById(planId))).toBeNull();
      expect(await asVenue(() => floorPlanService.setActive(planId, venueId))).toBeNull();
      expect(await asVenue(() => floorPlanService.clone(planId))).toBeNull();
      expect(await asVenue(() => floorPlanService.delete(planId))).toBe("not_found");

      // A new plan can reuse the archived tables' names.
      await expect(planWithTables("New patio", ["P1", "P2"])).resolves.toBeDefined();
    });

    it("refuses while a table still has an upcoming booking, so it never drops off the timeline", async () => {
      const { planId, tableIds } = await planWithTables("Terrace", ["R1"]);
      const soon = Date.now() + 86_400_000;
      await inVenue((tx) =>
        tx.reservation.create({
          data: {
            venueId,
            tableId: tableIds[0]!,
            date: new Date(new Date(soon).toISOString().slice(0, 10)),
            startTime: new Date(soon),
            endTime: new Date(soon + 5_400_000),
            partySize: 2,
            status: "CONFIRMED",
            guestName: "Bo",
          },
        })
      );

      expect(await asVenue(() => floorPlanService.delete(planId))).toBe("has_upcoming");

      const after = await inVenue(async (tx) => ({
        plan: await tx.floorPlan.findUnique({ where: { id: planId } }),
        table: await tx.table.findUnique({ where: { id: tableIds[0]! } }),
      }));
      expect(after.plan?.archivedAt).toBeNull();
      expect(after.table).toEqual(expect.objectContaining({ name: "R1", isActive: true }));
    });

    it("refuses to delete the active plan and changes nothing", async () => {
      const { planId, tableIds } = await planWithTables("Live", ["L1"], true);

      expect(await asVenue(() => floorPlanService.delete(planId))).toBe("active");

      const plan = await inVenue((tx) => tx.floorPlan.findUnique({ where: { id: planId } }));
      expect(plan?.isActive).toBe(true);
      expect(await inVenue((tx) => tx.table.count({ where: { id: { in: tableIds } } }))).toBe(1);
    });

    it("reports an unknown plan as not found", async () => {
      expect(await asVenue(() => floorPlanService.delete("no-such-plan"))).toBe("not_found");
    });
  });
});
