import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PutAvailabilityConfigBody, SetTonightBody } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import { listAvailabilityChanges, revertAvailabilityChange } from "./availability-changes.js";
import { getAvailabilityConfig, saveAvailabilityConfig } from "./availability-config.js";
import { createClosure, reopenClosure } from "./closure-command.js";
import { endTonight, setTonight } from "./tonight-command.js";

/**
 * Real-Postgres proof for #8120 and #8121, with a held venue row lock so the order changes commit in
 * is the one a lock-waiting request produces:
 *
 * - #8120: Undo is offered on the change with the highest version, not the newest `at`. A reopen
 *   stamped before a save that commits first holds the higher version; History offers Undo on the
 *   reopen and reverting the save is refused as `superseded`. Rows with no version keep their order.
 * - #8121: ending Tonight takes the venue row lock before it reads the config, so a save that
 *   committed while it waited is not overwritten by a projection of the state it never saw.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it. Shares the FORCE-toggling
 * suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const NOW = new Date("2026-11-01T12:00:00Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const manager = { actorId: "auth0|mgr", actorName: "Mgr", isManager: true };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!DATABASE_URL)(
  "undo order and Tonight end under a lock wait (real Postgres)",
  () => {
    const venueIds: string[] = [];
    let lockClient: pg.Client;
    let pool: pg.Pool;
    let client: PrismaClient;

    function inVenue<T>(venueId: string, work: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
        return work(tx as unknown as PrismaClient);
      });
    }

    async function seed(version: number): Promise<string> {
      const venueId = `undo-order-it-${randomUUID()}`;
      venueIds.push(venueId);
      await inVenue(venueId, async (tx) => {
        await tx.venue.create({
          data: {
            id: venueId,
            name: "Undo order IT",
            slug: venueId,
            ianaTimezone: "UTC",
            availabilityVersion: version,
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
      return venueId;
    }

    async function rename(venueId: string, name: string, expectedVersion: number, now: Date) {
      const state = await getAvailabilityConfig(venueId, now, client);
      const schedule = state!.config.schedules.find((s) => s.isRegular)!;
      const changes: PutAvailabilityConfigBody["changes"] = {
        upsert: { schedules: [{ ...schedule, name }] },
        remove: {},
      };
      return saveAvailabilityConfig(
        {
          venueId,
          actorId: `auth0|${name}`,
          body: { expectedVersion, changes, scopeConflicts: "keep" },
          now,
        },
        client
      );
    }

    /** Holds the venue row lock on its own connection until `release` commits. */
    async function holdVenueLock(venueId: string) {
      const blocker = new pg.Client({ connectionString: DATABASE_URL! });
      await blocker.connect();
      await blocker.query("BEGIN");
      await blocker.query("SELECT set_config('app.venue_id', $1, true)", [venueId]);
      await blocker.query("SELECT id FROM venues WHERE id = $1 FOR UPDATE", [venueId]);
      return {
        blocker,
        release: async () => {
          await blocker.query("COMMIT");
          await blocker.end();
        },
      };
    }

    const historyOf = async (venueId: string) =>
      (await listAvailabilityChanges(venueId, { limit: 25, offset: 0 }, client))!.items;

    beforeAll(async () => {
      lockClient = new pg.Client({ connectionString: DATABASE_URL! });
      await lockClient.connect();
      await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);
      pool = new pg.Pool({ connectionString: DATABASE_URL!, max: 20 });
      client = new PrismaClient({
        adapter: new PrismaPg(pool),
        transactionOptions: { timeout: 30_000, maxWait: 30_000 },
      });
    });

    afterAll(async () => {
      for (const venueId of venueIds) {
        await inVenue(venueId, (tx) =>
          tx.availabilityChange.deleteMany({ where: { venueId } })
        ).catch(() => undefined);
      }
      await lockClient?.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
      await lockClient?.end();
      await client?.$disconnect();
      await pool?.end();
    });

    it("offers Undo on the reopen that holds the higher version, and refuses reverting the save before it", async () => {
      const venueId = await seed(4);
      const ruleId = `rule-${randomUUID()}`;
      const closed = await createClosure(
        {
          venueId,
          caller: manager,
          body: {
            expectedVersion: 4,
            rule: {
              id: ruleId,
              kind: "closure",
              targetKind: "venue",
              startsOn: "2026-12-24",
              endsOn: "2026-12-24",
            },
            decisions: [],
          } as never,
          idempotencyKey: `k-${ruleId}`,
          now: NOW,
        },
        client
      );
      expect(closed).toMatchObject({ kind: "saved", result: { version: 5 } });

      const held = await holdVenueLock(venueId);
      // The save queues on the lock first, so it commits first (v6); the reopen was stamped earlier
      // but queues second, so it commits v7 with the older `at`.
      const savePromise = rename(venueId, "LaterSave", 5, at(120));
      await sleep(400);
      const reopenPromise = reopenClosure(
        { venueId, ruleId, caller: manager, tellCancelledGuests: false, now: at(60) },
        client
      );
      await sleep(400);
      await held.release();
      const [save, reopen] = await Promise.all([savePromise, reopenPromise]);
      expect(save).toMatchObject({ kind: "saved", version: 6 });
      expect(reopen).toMatchObject({ kind: "reopened", result: { version: 7 } });

      const items = await historyOf(venueId);
      const saveRow = items.find((i) => i.id === (save as { changeId: string }).changeId)!;
      const reopenRow = items.find((i) => i.kind === "reopen")!;
      expect(new Date(reopenRow.at).getTime()).toBeLessThan(new Date(saveRow.at).getTime());
      expect(reopenRow.revertible).toBe(true);
      expect(saveRow.revertible).toBe(false);

      const staleUndo = await revertAvailabilityChange(
        { venueId, changeId: saveRow.id, actorId: "auth0|mgr", expectedVersion: 7, now: at(180) },
        client
      );
      expect(staleUndo).toEqual({ kind: "refused", reason: "superseded" });
    });

    it("keeps the order of rows with no version, and places them before every versioned row", async () => {
      const venueId = await seed(0);
      const row = (id: string, secondsAgo: number, version?: number) =>
        inVenue(venueId, (tx) =>
          tx.availabilityChange.create({
            data: {
              id: `${venueId}-${id}`,
              venueId,
              actorId: `auth0|${id}`,
              at: at(-secondsAgo),
              kind: "config",
              summary: id,
              inverse: {},
              ...(version === undefined ? {} : { version }),
            },
          })
        );
      const undoOffered = async () =>
        (await historyOf(venueId)).filter((i) => i.revertible).map((i) => i.summary);

      await row("old-1", 300);
      await row("old-2", 200);
      expect(await undoOffered()).toEqual(["old-2"]);

      // A versioned row stamped before a NULL row still comes after it: NULL rows predate the column.
      await row("new-3", 500, 3);
      expect(await undoOffered()).toEqual(["new-3"]);

      await row("new-4", 600, 4);
      expect(await undoOffered()).toEqual(["new-4"]);
    });

    it("ends Tonight against the state a save left while it waited for the lock", async () => {
      const venueId = await seed(4);
      const tonight = await setTonight(
        {
          venueId,
          caller: manager,
          body: {
            expectedVersion: 4,
            ruleId: `t-${randomUUID()}`,
            change: { type: "pause_online" },
            decisions: [],
          } as unknown as SetTonightBody,
          now: NOW,
        },
        client
      );
      expect(tonight.kind).toBe("saved");
      if (tonight.kind !== "saved") return;

      const held = await holdVenueLock(venueId);
      // Ending Tonight queues on the lock; the save below commits first, then it gets the lock.
      const endPromise = endTonight(
        { venueId, ruleId: tonight.result.ruleId, caller: manager, now: at(30) },
        client
      );
      await sleep(400);
      await held.blocker.query(
        "UPDATE schedule_services SET closes_at = 1380 WHERE venue_id = $1",
        [venueId]
      );
      await held.blocker.query(
        "UPDATE venues SET availability_version = availability_version + 1 WHERE id = $1",
        [venueId]
      );
      await held.release();
      const ended = await endPromise;

      expect(ended).toMatchObject({ kind: "ended", result: { version: 7 } });
      const after = await inVenue(venueId, (tx) =>
        tx.venue.findUnique({ where: { id: venueId }, select: { operatingHours: true } })
      );
      // The projection written by the end is of the state with the save, not of the one read before it.
      expect(JSON.stringify(after?.operatingHours)).toContain("23:00");
      const change = await inVenue(venueId, (tx) =>
        tx.availabilityChange.findFirst({ where: { venueId, kind: "tonight_end" } })
      );
      expect(change?.version).toBe(7);
    });
  }
);
