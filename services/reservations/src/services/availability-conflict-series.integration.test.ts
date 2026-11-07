import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { DateRule } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import { getAvailabilityConfig, saveAvailabilityConfig } from "./availability-config.js";
import { createClosure } from "./closure-command.js";

/**
 * Real-Postgres proof for #8093 on the series-edit path: a closure save whose compare-and-set
 * matched but whose series a teammate changed is refused from inside its own transaction, which
 * has already bumped the version (uncommitted). The conflict must report the committed version and
 * name the teammate's change, not the bump that is about to roll back.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const NOW = new Date("2026-11-01T12:00:00Z");
const MANAGER = { actorId: "auth0|manager", actorName: "Manager", isManager: true };

describe.skipIf(!DATABASE_URL)(
  "a series edit refused after its own compare-and-set (real Postgres)",
  () => {
    const venueId = `conflict-series-it-${randomUUID()}`;
    let lockClient: pg.Client;
    let pool: pg.Pool;
    let client: PrismaClient;

    function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
        return work(tx as unknown as PrismaClient);
      });
    }

    const versionNow = () =>
      inVenue((tx) =>
        tx.venue.findUnique({ where: { id: venueId }, select: { availabilityVersion: true } })
      ).then((v) => v!.availabilityVersion);

    beforeAll(async () => {
      lockClient = new pg.Client({ connectionString: DATABASE_URL! });
      await lockClient.connect();
      await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);
      pool = new pg.Pool({ connectionString: DATABASE_URL! });
      client = new PrismaClient({ adapter: new PrismaPg(pool) });

      await inVenue(async (tx) => {
        await tx.venue.create({
          data: {
            id: venueId,
            name: "Conflict series IT",
            slug: venueId,
            ianaTimezone: "UTC",
            availabilityVersion: 4,
          },
        });
        const schedule = await tx.schedule.create({
          data: { venueId, name: "Regular", kind: "regular", isRegular: true },
        });
        const service = await tx.venueService.create({ data: { venueId, name: "Dinner" } });
        await tx.scheduleService.create({
          data: {
            venueId,
            scheduleId: schedule.id,
            venueServiceId: service.id,
            opensAt: 1020,
            lastSeatingAt: 1260,
            closesAt: 1320,
            seating: { version: 1, interval: 15 },
            bookingTypes: ["online", "phone"],
          },
        });
        await tx.scheduleAssignment.create({
          data: { venueId, scheduleId: schedule.id, weekdays: [0, 1, 2, 3, 4, 5, 6] },
        });
      });
    });

    afterAll(async () => {
      await lockClient?.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
      await lockClient?.end();
      await client?.$disconnect();
      await pool?.end();
    });

    it("reports the committed version and names the teammate's series change", async () => {
      // Date-rule ids are unique across the table, so a rerun against the same DB needs its own.
      const s1 = `s1-${randomUUID()}`;
      const series = {
        id: s1,
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-12-03",
        endsOn: null,
        repeat: { version: 1, weekdays: [4] },
      } as DateRule;
      const created = await createClosure(
        {
          venueId,
          caller: MANAGER,
          body: { expectedVersion: 4, rule: series, decisions: [] },
          idempotencyKey: `k-${randomUUID()}`,
          now: NOW,
        },
        client
      );
      expect(created).toMatchObject({ kind: "saved" });

      // The Manager reads the series, then a teammate changes it (v5 -> v6).
      const read = (await getAvailabilityConfig(venueId, NOW, client))!;
      const asRead = read.config.dateRules.find((r) => r.id === s1)!;
      const teammate = await saveAvailabilityConfig(
        {
          venueId,
          actorId: "auth0|teammate",
          body: {
            expectedVersion: 5,
            changes: {
              upsert: { dateRules: [{ ...asRead, guestMessage: "Private event" }] },
              remove: {},
            },
            scopeConflicts: "keep",
          },
          now: new Date(NOW.getTime() + 60_000),
        },
        client
      );
      expect(teammate).toMatchObject({ kind: "saved", version: 6 });

      // The Manager's edit of the series goes against v6 (an Overwrite pin) from a stale read.
      const outcome = await createClosure(
        {
          venueId,
          caller: MANAGER,
          body: {
            expectedVersion: 6,
            rule: {
              ...series,
              id: `${s1}-b`,
              repeat: { version: 1, weekdays: [4, 5] },
            } as DateRule,
            alongside: { upsert: [], remove: [s1], replaces: asRead },
            decisions: [],
          },
          idempotencyKey: `k-${randomUUID()}`,
          now: new Date(NOW.getTime() + 120_000),
        },
        client
      );

      expect(outcome).toMatchObject({
        kind: "version_conflict",
        // Not 7: the refused transaction's own bump rolls back, so v7 never exists.
        currentVersion: 6,
        winningChange: { actorId: "auth0|teammate", kind: "config" },
      });
      expect(await versionNow()).toBe(6);
    });
  }
);
