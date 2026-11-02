import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { CONFLICT_CHANGES_MAX } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import { getAvailabilityConfig, saveAvailabilityConfig } from "./availability-config.js";

/**
 * Real-Postgres proof for #8093: a version-conflict names every change between the draft's version
 * and the current one, ordered by the version each produced, bounded however stale the draft is.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it. Shares the FORCE-toggling
 * suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const NOW = new Date("2026-11-01T12:00:00Z");

describe.skipIf(!DATABASE_URL)(
  "version-conflict names the changes since the draft (real Postgres)",
  () => {
    const venueId = `conflict-it-${randomUUID()}`;
    let lockClient: pg.Client;
    let pool: pg.Pool;
    let client: PrismaClient;

    /** Runs `work` with the venue's RLS context set, as a write transaction. */
    function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
        return work(tx as unknown as PrismaClient);
      });
    }

    /** A save that renames the regular schedule, from whatever version `expectedVersion` says. */
    async function rename(name: string, expectedVersion: number, minutes: number) {
      const state = await getAvailabilityConfig(venueId, NOW, client);
      const { config } = state!;
      const schedule = config.schedules.find((s) => s.isRegular)!;
      return saveAvailabilityConfig(
        {
          venueId,
          actorId: `auth0|${name}`,
          body: {
            expectedVersion,
            changes: { upsert: { schedules: [{ ...schedule, name }] }, remove: {} },
            scopeConflicts: "keep",
          },
          now: new Date(NOW.getTime() + minutes * 60_000),
        },
        client
      );
    }

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
            name: "Conflict IT",
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
      await inVenue(async (tx) => {
        await tx.availabilityChange.deleteMany({ where: { venueId } }).catch(() => undefined);
      }).catch(() => undefined);
      await lockClient?.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
      await lockClient?.end();
      await client?.$disconnect();
      await pool?.end();
    });

    it("names A (v5) and B (v6) to a draft on v4, and bounds the list for a very old one", async () => {
      const a = await rename("A", 4, 1);
      const b = await rename("B", 5, 2);
      expect(a).toMatchObject({ kind: "saved", version: 5 });
      expect(b).toMatchObject({ kind: "saved", version: 6 });

      const manager = await rename("Manager", 4, 3);

      expect(manager).toMatchObject({
        kind: "version_conflict",
        currentVersion: 6,
        winningChange: { actorId: "auth0|B" },
        changesSince: {
          total: 2,
          changes: [{ actorId: "auth0|B" }, { actorId: "auth0|A" }],
        },
      });

      // A draft on v0 is 6 versions behind: the rows before v5 do not exist, and none is invented.
      const old = await rename("Old", 0, 4);
      expect(old).toMatchObject({ changesSince: { total: 6 } });
      expect(old.kind === "version_conflict" && old.changesSince?.changes).toHaveLength(2);
    });

    it("orders by the version a change produced when a reopen was stamped before the save it followed", async () => {
      // Reopen stamped at 12:00:00 but committed after a save stamped later: it holds v7.
      await inVenue(async (tx) => {
        await tx.availabilityChange.create({
          data: {
            venueId,
            actorId: "auth0|ana",
            at: new Date(NOW.getTime() - 60_000),
            kind: "reopen",
            summary: "Closure reopened (2026-11-01)",
            inverse: {},
            version: 7,
          },
        });
        await tx.venue.update({ where: { id: venueId }, data: { availabilityVersion: 7 } });
      });

      const outcome = await rename("Manager", 4, 5);

      expect(outcome).toMatchObject({
        kind: "version_conflict",
        currentVersion: 7,
        // Newest by `at` is B's save; newest by version is the reopen, which `currentVersion` includes.
        winningChange: { kind: "reopen" },
        changesSince: {
          total: 3,
          changes: [{ kind: "reopen" }, { actorId: "auth0|B" }, { actorId: "auth0|A" }],
        },
      });
    });

    it("never reads more than the bound, however far behind the draft is", async () => {
      await inVenue(async (tx) => {
        await tx.availabilityChange.createMany({
          data: Array.from({ length: CONFLICT_CHANGES_MAX + 5 }, (_, i) => ({
            venueId,
            actorId: "auth0|bulk",
            at: NOW,
            kind: "config",
            summary: `bulk ${i}`,
            inverse: {},
            version: 8 + i,
          })),
        });
        await tx.venue.update({
          where: { id: venueId },
          data: { availabilityVersion: 8 + CONFLICT_CHANGES_MAX + 4 },
        });
      });

      const outcome = await rename("Manager", 0, 6);

      expect(outcome.kind).toBe("version_conflict");
      if (outcome.kind !== "version_conflict") return;
      expect(outcome.changesSince?.total).toBe(8 + CONFLICT_CHANGES_MAX + 4);
      expect(outcome.changesSince?.changes).toHaveLength(CONFLICT_CHANGES_MAX);
      expect(outcome.winningChange?.summary).toBe(`bulk ${CONFLICT_CHANGES_MAX + 4}`);
    });
  }
);
