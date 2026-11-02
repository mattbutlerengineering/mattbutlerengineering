import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ClosureAlongside, DateRule } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import { revertAvailabilityChange } from "./availability-changes.js";
import { carriedOutcomeIds } from "./closure-carry-outcomes.js";
import { createClosure } from "./closure-command.js";
import { getClosureImpact } from "./closure-impact-store.js";
import { loadClosureChanges } from "./closure-changes.js";
import { createClosureNoticeService } from "./closure-notice-service.js";
import { listNotifiable, listSummaries } from "./closure-notice-store.js";
import { createClosureRefunds } from "./closure-refund.js";
import { createPrismaClosureRefundStore } from "./closure-refund-store.js";
import { createPrismaClosureOutcomeSweepStore } from "./closure-outcome-sweep-store.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Real-Postgres proof for #7984: a series edit that grows the series saves it under a new rule id
 * (`series-edit.ts` `growthClosure`), and the guests the old rule cancelled, with their counts and
 * call list, follow it to the new id instead of dropping off the row. They are carried, not new:
 * the new save's post-commit work (notices, refunds, SSE) and its replay answer cover only what
 * the save itself decided, and Undo of a growth that told no guest puts them back exactly.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it. Shares the FORCE-toggling
 * suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const NOW = new Date("2026-12-20T12:00:00Z");
const CALLER = { isManager: true, actorId: "auth0|ana", actorName: "Ana" };
// 2026-12-21 is a Monday, so these three dates fall on weekdays 1, 2 and 3.
const MONDAY = "2026-12-21";
const TUESDAY = "2026-12-22";
const WEDNESDAY = "2026-12-23";

type Action = "cancel" | "keep_silent";

describe.skipIf(!DATABASE_URL)("a grown series keeps its outcomes (real Postgres)", () => {
  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;

  /** A venue of its own, so one test's closures never shape another's. */
  /** Venues made by this file; removed after it, so the shared database's venue list stays short. */
  const venueIds: string[] = [];

  async function world() {
    const venueId = `carry-it-${randomUUID()}`;
    venueIds.push(venueId);
    const P = `${randomUUID().slice(0, 8)}-`;
    let tableId = "";
    const inVenue = <T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> =>
      client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
        return work(tx as unknown as PrismaClient);
      });
    await inVenue(async (tx) => {
      await tx.venue.create({
        data: { id: venueId, name: "Carry IT", slug: venueId, ianaTimezone: "UTC" },
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
          closesAt: 1380,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      });
      await tx.scheduleAssignment.create({
        data: { venueId, scheduleId: schedule.id, weekdays: [0, 1, 2, 3, 4, 5, 6] },
      });
      tableId = (await tx.table.create({ data: { venueId, name: "T1", capacity: 4 } })).id;
    });

    const book = async (id: string, date: string) => {
      const startTime = new Date(`${date}T20:00:00Z`);
      await inVenue((tx) =>
        tx.reservation.create({
          data: {
            id: P + id,
            venueId,
            tableId,
            date: new Date(`${date}T00:00:00Z`),
            startTime,
            endTime: new Date(startTime.getTime() + 3_600_000),
            partySize: 2,
            status: "CONFIRMED",
            guestName: `Guest ${id}`,
            guestEmail: `${id}@example.com`,
          },
        })
      );
      return P + id;
    };
    const versionNow = async () =>
      (await inVenue((tx) => tx.venue.findUniqueOrThrow({ where: { id: venueId } })))
        .availabilityVersion;
    const seriesOf = (id: string, weekdays: number[]): DateRule => ({
      id,
      kind: "closure",
      targetKind: "venue",
      startsOn: MONDAY,
      endsOn: "2027-01-31",
      repeat: { version: 1, weekdays },
      guestMessage: "Closed on Mondays",
    });
    /** Saves `rule` (with `alongside` when it replaces a series), deciding every group `action`. */
    const save = async (
      rule: DateRule,
      action: Action,
      alongside?: ClosureAlongside,
      key: string = randomUUID()
    ) => {
      const found = await getClosureImpact(venueId, rule, NOW, client, alongside);
      if (found.kind !== "ok") throw new Error(`impact ${found.kind}`);
      const saved = await createClosure(
        {
          venueId,
          caller: CALLER,
          idempotencyKey: key,
          now: NOW,
          body: {
            expectedVersion: await versionNow(),
            rule,
            ...(alongside ? { alongside } : {}),
            decisions: found.impact.groups.map((g) => ({
              groupKey: g.groupKey,
              action,
              reservationIds: g.reservations.map((r) => r.id),
              ...(action === "keep_silent" ? { acknowledged: true } : {}),
            })),
          },
        },
        client
      );
      if (saved.kind !== "saved") throw new Error(`save ${saved.kind}`);
      return saved.result;
    };
    const replace = (old: DateRule): ClosureAlongside => ({
      upsert: [],
      remove: [old.id],
      replaces: old,
    });
    const outcomeOf = (reservationId: string) =>
      inVenue((tx) => tx.closureOutcome.findFirstOrThrow({ where: { venueId, reservationId } }));
    const totalOf = async (ruleId: string) =>
      (await inVenue((tx) => listSummaries(venueId, NOW, tx))).find((s) => s.ruleId === ruleId)
        ?.total ?? 0;
    const revert = (saved: { changeId: string; version: number }) =>
      revertAvailabilityChange(
        {
          venueId,
          changeId: saved.changeId,
          actorId: CALLER.actorId,
          expectedVersion: saved.version,
          now: NOW,
        },
        client
      );
    return {
      venueId,
      inVenue,
      book,
      seriesOf,
      save,
      replace,
      outcomeOf,
      totalOf,
      revert,
      carriedOf: (ruleId: string) => inVenue((tx) => carriedOutcomeIds(tx, venueId, ruleId)),
      replay: async (key: string, rule: DateRule, old: DateRule, expectedVersion: number) => {
        const again = await createClosure(
          {
            venueId,
            caller: CALLER,
            idempotencyKey: key,
            now: NOW,
            body: { expectedVersion, rule, alongside: replace(old), decisions: [] },
          },
          client
        );
        if (again.kind !== "saved") throw new Error(`replay ${again.kind}`);
        return again.result;
      },
    };
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);
    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  // After each test, not at the end: at most one of this file's venues exists at a time.
  afterEach(async () => {
    for (const venueId of venueIds.splice(0)) {
      await client
        ?.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
          const where = { venueId };
          await tx.closureOutcome.deleteMany({ where });
          await tx.availabilityChange.deleteMany({ where });
          await tx.reservationEvent.deleteMany({ where });
          await tx.reservation.deleteMany({ where });
          await tx.table.deleteMany({ where });
          await tx.dateRule.deleteMany({ where });
          await tx.scheduleAssignment.deleteMany({ where });
          await tx.scheduleService.deleteMany({ where });
          await tx.venueService.deleteMany({ where });
          await tx.schedule.deleteMany({ where });
          await tx.venue.delete({ where: { id: venueId } });
        })
        .catch(() => undefined);
    }
  });

  afterAll(async () => {
    await lockClient?.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient?.end();
    await client?.$disconnect();
    await pool?.end();
  });

  it("carries the old rule's outcomes to the grown series, and Undo of a silent growth puts them back", async () => {
    const w = await world();
    await w.book("mon", MONDAY);
    await w.book("tue", TUESDAY);
    await w.book("wed", WEDNESDAY);

    const original = w.seriesOf(`s-${randomUUID()}`, [1]);
    await w.save(original, "cancel");
    expect(await w.totalOf(original.id)).toBe(1);

    // Mondays and Tuesdays: a new rule id, the original removed beside it.
    const grown = w.seriesOf(`s-${randomUUID()}`, [1, 2]);
    await w.save(grown, "cancel", w.replace(original));
    // Monday's cancelled guest and Tuesday's now sit on the one row the Manager sees.
    expect(await w.totalOf(grown.id)).toBe(2);
    expect(await w.totalOf(original.id)).toBe(0);

    // Adding Wednesday and keeping its booking tells nobody, so History can revert it.
    const grownAgain = w.seriesOf(`s-${randomUUID()}`, [1, 2, 3]);
    const silent = await w.save(grownAgain, "keep_silent", w.replace(grown));
    // The two carried guests and Wednesday's kept one.
    expect(await w.totalOf(grownAgain.id)).toBe(3);
    expect(await w.totalOf(grown.id)).toBe(0);

    expect((await w.revert(silent)).kind).toBe("saved");
    expect(await w.totalOf(grown.id)).toBe(2);
  });

  it("does no post-commit work for carried outcomes: no notice, no SSE, no second refund job", async () => {
    const w = await world();
    const mon = await w.book("mon", MONDAY);
    await w.book("wed", WEDNESDAY);
    const original = w.seriesOf(`s-${randomUUID()}`, [1]);
    await w.save(original, "cancel");
    // The cancel's notice failed, and its refund is still owed.
    const carried = await w.outcomeOf(mon);
    await w.inVenue((tx) =>
      tx.closureOutcome.update({
        where: { id: carried.id },
        data: { deliveries: { email: "failed" }, refund: "pending" },
      })
    );

    const grown = w.seriesOf(`s-${randomUUID()}`, [1, 3]);
    const silent = await w.save(grown, "keep_silent", w.replace(original));
    expect(silent.outcomes).toMatchObject({ cancel: 0, keep_silent: 1 });

    const noticeJobs: string[] = [];
    const notices = createClosureNoticeService({
      scheduler: {
        schedule: async (_type: unknown, payload: { outcomeId: string }) => {
          noticeJobs.push(payload.outcomeId);
          return "job";
        },
      } as never,
    });
    const refundJobs: string[] = [];
    const refunds = createClosureRefunds({
      store: createPrismaClosureRefundStore(),
      jobs: {
        schedule: async (_type: unknown, payload: { outcomeId: string }) => {
          refundJobs.push(payload.outcomeId);
          return "job";
        },
      } as never,
    });
    const carriedIds = await w.carriedOf(grown.id);
    expect(carriedIds).toEqual([carried.id]);
    await runWithVenueContext(w.venueId, async () => {
      // Nothing decided in this save is owed a notice, and the carried guest is not told again.
      expect(
        await notices.enqueueForClosure({
          venueId: w.venueId,
          ruleId: grown.id,
          now: NOW,
          carried: carriedIds,
        })
      ).toBe(0);
      expect((await loadClosureChanges(w.venueId, grown.id, carriedIds)).cancelled).toEqual([]);
      expect(await refunds.enqueue(w.venueId, grown.id, carriedIds)).toBe(0);
      // A Manager's Retry, and the reopen notice, are asks about the guests the closure cancelled.
      expect(await refunds.retry(w.venueId, grown.id)).toBe(1);
      expect(await listNotifiable(w.venueId, grown.id, "reopened", NOW, undefined)).toEqual([
        { outcomeId: carried.id },
      ]);
    });
    expect(noticeJobs).toEqual([]);
    expect(refundJobs).toEqual([carried.id]);
  });

  it("notifies only the outcomes a cancelling growth decided", async () => {
    const w = await world();
    const mon = await w.book("mon", MONDAY);
    const wed = await w.book("wed", WEDNESDAY);
    const original = w.seriesOf(`s-${randomUUID()}`, [1]);
    await w.save(original, "cancel");
    const grown = w.seriesOf(`s-${randomUUID()}`, [1, 3]);
    await w.save(grown, "cancel", w.replace(original));

    const jobs: string[] = [];
    const notices = createClosureNoticeService({
      scheduler: {
        schedule: async (_type: unknown, payload: { outcomeId: string }) => {
          jobs.push(payload.outcomeId);
          return "job";
        },
      } as never,
    });
    const carriedIds = await w.carriedOf(grown.id);
    await runWithVenueContext(w.venueId, async () => {
      await notices.enqueueForClosure({
        venueId: w.venueId,
        ruleId: grown.id,
        now: NOW,
        carried: carriedIds,
      });
      const changes = await loadClosureChanges(w.venueId, grown.id, carriedIds);
      expect(changes.cancelled.map((r) => r.id)).toEqual([wed]);
    });
    expect(jobs).toEqual([(await w.outcomeOf(wed)).id]);
    expect(jobs).not.toContain((await w.outcomeOf(mon)).id);
  });

  it("leaves a carried pending refund to the sweeper on its original clock", async () => {
    const w = await world();
    const mon = await w.book("mon", MONDAY);
    await w.book("wed", WEDNESDAY);
    const original = w.seriesOf(`s-${randomUUID()}`, [1]);
    await w.save(original, "cancel");
    const carried = await w.outcomeOf(mon);
    // Pending for an hour: well past the sweep's five-minute grace.
    await w.inVenue(
      (tx) =>
        tx.$executeRaw`UPDATE closure_outcomes SET refund = 'pending', updated_at = now() - interval '1 hour' WHERE id = ${carried.id}`
    );

    await w.save(w.seriesOf(`s-${randomUUID()}`, [1, 3]), "keep_silent", w.replace(original));

    const stuck = await runWithVenueContext(w.venueId, () =>
      createPrismaClosureOutcomeSweepStore().listStuckRefunds(
        w.venueId,
        new Date(Date.now() - 5 * 60_000),
        10
      )
    );
    expect(stuck.map((o) => o.id)).toEqual([carried.id]);
  });

  it("answers a replay with what the save decided, before and after a later growth", async () => {
    const w = await world();
    await w.book("mon", MONDAY);
    await w.book("tue", TUESDAY);
    await w.book("wed", WEDNESDAY);
    const original = w.seriesOf(`s-${randomUUID()}`, [1]);
    await w.save(original, "cancel");

    const grown = w.seriesOf(`s-${randomUUID()}`, [1, 3]);
    const key = randomUUID();
    const first = await w.save(grown, "keep_silent", w.replace(original), key);
    const decided = { cancel: 0, move: 0, keep_notify: 0, keep_silent: 1 };
    expect(first.outcomes).toEqual(decided);
    expect((await w.replay(key, grown, original, first.version - 1)).outcomes).toEqual(decided);

    await w.save(w.seriesOf(`s-${randomUUID()}`, [1, 2, 3]), "cancel", w.replace(grown));
    expect((await w.replay(key, grown, original, first.version - 1)).outcomes).toEqual(decided);
  });
});
