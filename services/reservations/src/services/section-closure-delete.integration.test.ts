import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { readStoredConfig, type ConfigRowDb } from "./availability-config-rows.js";
import { floorPlanSectionService } from "./floor-plan-section.js";
import { floorPlanService } from "./floor-plan.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Real-Postgres proof for ADR-032's section closures: a closure follows live membership, and a
 * live closure keeps blocking its tables when its section goes away.
 *
 * It also settles which path hard-deletes sections: deleting a section on its own, and deleting a
 * floor plan nothing was ever booked on (ON DELETE CASCADE from `floor_plans`). An archived plan
 * keeps its sections. Both hard-deleting paths run the same materialisation.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it.
 * Shares the FORCE-toggling suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;

describe.skipIf(!DATABASE_URL)(
  "section closures vs. section and plan delete (real Postgres)",
  () => {
    const venueId = `sec-closure-it-${randomUUID()}`;
    const now = new Date("2026-11-07T12:00:00.000Z");
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

    /** A plan with one section holding two tables, and a closure on the section ending on `endsOn`. */
    async function seed(endsOn: string | null) {
      return inVenue(async (tx) => {
        const plan = await tx.floorPlan.create({
          data: { venueId, name: `Plan ${randomUUID()}`, layoutJson: { width: 800, height: 600 } },
        });
        const section = await tx.floorPlanSection.create({
          data: { venueId, floorPlanId: plan.id, name: "Bar" },
        });
        const tables = await Promise.all(
          ["B1", "B2"].map((name) =>
            tx.table.create({
              data: {
                venueId,
                floorPlanId: plan.id,
                sectionId: section.id,
                name: `${name}-${randomUUID().slice(0, 4)}`,
                capacity: 2,
              },
            })
          )
        );
        const rule = await tx.dateRule.create({
          data: {
            venueId,
            kind: "closure",
            targetKind: "tables",
            sectionId: section.id,
            startsOn: new Date("2026-11-01T00:00:00Z"),
            endsOn: endsOn ? new Date(`${endsOn}T00:00:00Z`) : null,
            createdBy: "it",
          },
        });
        return {
          planId: plan.id,
          sectionId: section.id,
          ruleId: rule.id,
          tableIds: tables.map((t) => t.id).sort(),
        };
      });
    }

    const ruleState = (ruleId: string) =>
      inVenue(async (tx) => {
        const rule = await tx.dateRule.findUniqueOrThrow({
          where: { id: ruleId },
          include: { tables: { select: { tableId: true } } },
        });
        return {
          sectionId: rule.sectionId,
          tableIds: rule.tables.map((t) => t.tableId).sort(),
          deletedAt: rule.deletedAt,
        };
      });

    beforeAll(async () => {
      lockClient = new pg.Client({ connectionString: DATABASE_URL! });
      await lockClient.connect();
      await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

      pool = new pg.Pool({ connectionString: DATABASE_URL! });
      client = new PrismaClient({ adapter: new PrismaPg(pool) });
      await inVenue((tx) =>
        tx.venue.create({
          data: { id: venueId, name: "Section closure IT", slug: venueId, ianaTimezone: "UTC" },
        })
      );
    });

    afterAll(async () => {
      await inVenue(async (tx) => {
        await tx.dateRule.deleteMany({ where: { venueId } });
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

    it("reads a section closure through the section's tables as they are now", async () => {
      const { sectionId, ruleId, tableIds, planId } = await seed(null);
      const read = async () =>
        (
          await inVenue(async (tx) => readStoredConfig(tx as unknown as ConfigRowDb, venueId))
        ).config.dateRules
          .find((r) => r.id === ruleId)
          ?.tableIds?.slice()
          .sort();

      expect(await read()).toEqual(tableIds);

      // Move one table out of the section: the closure stops blocking it, with no rule edit.
      const [moved, kept] = tableIds as [string, string];
      await inVenue((tx) => tx.table.update({ where: { id: moved }, data: { sectionId: null } }));
      expect(await read()).toEqual([kept]);

      // And back in.
      await inVenue((tx) => tx.table.update({ where: { id: moved }, data: { sectionId } }));
      expect(await read()).toEqual(tableIds);
      await asVenue(() => floorPlanSectionService.delete(venueId, sectionId, now));
      await inVenue((tx) => tx.floorPlan.deleteMany({ where: { id: planId } }));
    });

    it("keeps a live closure as a plain tables closure when its section is deleted", async () => {
      const { sectionId, ruleId, tableIds } = await seed("2026-12-24");
      const before = await inVenue((tx) =>
        tx.venue.findUniqueOrThrow({
          where: { id: venueId },
          select: { availabilityVersion: true },
        })
      );

      expect(await asVenue(() => floorPlanSectionService.delete(venueId, sectionId, now))).toBe(
        true
      );

      expect(await ruleState(ruleId)).toEqual({ sectionId: null, tableIds, deletedAt: null });
      const after = await inVenue((tx) =>
        tx.venue.findUniqueOrThrow({
          where: { id: venueId },
          select: { availabilityVersion: true },
        })
      );
      expect(after.availabilityVersion).toBe(before.availabilityVersion + 1);
      const read = await inVenue((tx) => readStoredConfig(tx as unknown as ConfigRowDb, venueId));
      expect(read.config.dateRules.find((r) => r.id === ruleId)).toMatchObject({
        targetKind: "tables",
        tableIds,
      });
    });

    it("does not materialise a closure that has already ended", async () => {
      const { sectionId, ruleId } = await seed("2026-10-01");

      await asVenue(() => floorPlanSectionService.delete(venueId, sectionId, now));

      // The foreign key clears the section; nothing is written for a closure that is over.
      expect(await ruleState(ruleId)).toEqual({ sectionId: null, tableIds: [], deletedAt: null });
    });

    it("hard-deletes a never-booked plan's sections by cascade and materialises their closures", async () => {
      const { planId, sectionId, ruleId, tableIds } = await seed(null);

      expect(await asVenue(() => floorPlanService.delete(planId))).toBe("deleted");

      const left = await inVenue((tx) => tx.floorPlanSection.count({ where: { id: sectionId } }));
      // Verified: the plan's sections are hard-deleted (ON DELETE CASCADE), so the plan-delete path
      // had to run the same materialisation.
      expect(left).toBe(0);
      const rule = await ruleState(ruleId);
      expect(rule.sectionId).toBeNull();
      // Its tables went with the plan (join rows cascade), so the closure that remains blocks none.
      expect(rule.tableIds).toEqual([]);
      expect(tableIds).toHaveLength(2);
    });

    it("keeps an archived plan's sections, and the closure that names one", async () => {
      const { planId, sectionId, ruleId, tableIds } = await seed(null);
      // History on one table makes the plan archive instead of delete.
      await inVenue(async (tx) => {
        await tx.reservation.create({
          data: {
            venueId,
            tableId: tableIds[0]!,
            date: new Date("2026-10-01T00:00:00Z"),
            startTime: new Date("2026-10-01T18:00:00Z"),
            endTime: new Date("2026-10-01T19:30:00Z"),
            partySize: 2,
            guestName: "History",
            status: "CANCELLED",
          },
        });
      });

      expect(await asVenue(() => floorPlanService.delete(planId))).toBe("archived");

      expect(await inVenue((tx) => tx.floorPlanSection.count({ where: { id: sectionId } }))).toBe(
        1
      );
      expect((await ruleState(ruleId)).sectionId).toBe(sectionId);
    });
  }
);
