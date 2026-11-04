import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { DateRule } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import { listAvailabilityChanges, revertAvailabilityChange } from "./availability-changes.js";
import { createClosure, reopenClosure } from "./closure-command.js";
import { getClosureImpact } from "./closure-impact-store.js";
import { listNotifiable, listSummaries } from "./closure-notice-store.js";

/**
 * Real-Postgres proof for #7984 criterion 3: reopening one date of a range closure removes the
 * range, saves the dates either side of it as new rules, and moves each cancelled guest's outcome
 * to the rule that still closes their date. The reopened date's guests alone are told, and Undo of
 * a reopen that told no one puts the range and every outcome back exactly.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it, as a non-superuser owner.
 * Shares the FORCE-toggling suites' advisory lock so it never sees their window. Each test builds
 * a venue of its own and deletes it afterwards. Dates are venue-local civil dates in a UTC venue,
 * so the suite does not depend on the process time zone.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const NOW = new Date("2026-12-20T12:00:00Z");
const CALLER = { isManager: true, actorId: "auth0|ana", actorName: "Ana" };
const DAYS = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25"] as const;

describe.skipIf(!DATABASE_URL)("reopening one date of a range (real Postgres)", () => {
  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;
  const venueIds: string[] = [];

  async function world(opts: { hostGrant?: boolean } = {}) {
    const venueId = `reopen-it-${randomUUID()}`;
    venueIds.push(venueId);
    const P = `${randomUUID().slice(0, 8)}-`;
    let tableId = "";
    const serviceId = `svc-${randomUUID()}`;
    const inVenue = <T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> =>
      client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
        return work(tx as unknown as PrismaClient);
      });
    await inVenue(async (tx) => {
      await tx.venue.create({
        data: {
          id: venueId,
          name: "Reopen IT",
          slug: venueId,
          ianaTimezone: "UTC",
          hostEmergencyClose: opts.hostGrant ?? false,
        },
      });
      const schedule = await tx.schedule.create({
        data: { venueId, name: "Regular", kind: "regular", isRegular: true },
      });
      const service = await tx.venueService.create({
        data: { id: serviceId, venueId, name: "Dinner" },
      });
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
    /** A booking on service date `date`, at 8 PM unless `startAt` says when (it may be past midnight). */
    const book = async (date: string, startAt = `${date}T20:00:00Z`) => {
      const startTime = new Date(startAt);
      const id = P + date;
      await inVenue((tx) =>
        tx.reservation.create({
          data: {
            id,
            venueId,
            tableId,
            date: new Date(`${date}T00:00:00Z`),
            startTime,
            endTime: new Date(startTime.getTime() + 3_600_000),
            partySize: 2,
            status: "CONFIRMED",
            guestName: `Guest ${date}`,
            guestEmail: `${date}@example.com`,
          },
        })
      );
      return id;
    };
    const versionNow = async () =>
      (await inVenue((tx) => tx.venue.findUniqueOrThrow({ where: { id: venueId } })))
        .availabilityVersion;
    const rangeOf = (startsOn: string, endsOn: string): DateRule => ({
      id: `range-${randomUUID()}`,
      kind: "closure",
      targetKind: "venue",
      startsOn,
      endsOn,
      guestMessage: "Closed for the holidays",
    });
    const cancelAll = async (rule: DateRule, caller: typeof CALLER = CALLER) => {
      const found = await getClosureImpact(venueId, rule, NOW, client);
      if (found.kind !== "ok") throw new Error(`impact ${found.kind}`);
      const saved = await createClosure(
        {
          venueId,
          caller,
          idempotencyKey: randomUUID(),
          now: NOW,
          body: {
            expectedVersion: await versionNow(),
            rule,
            decisions: found.impact.groups.map((g) => ({
              groupKey: g.groupKey,
              action: "cancel" as const,
              reservationIds: g.reservations.map((r) => r.id),
            })),
          },
        },
        client
      );
      if (saved.kind !== "saved") throw new Error(`save ${saved.kind}`);
      return saved.result;
    };
    const reopen = (
      rule: DateRule,
      date: string | undefined,
      tell: boolean,
      over: { caller?: typeof CALLER; seen?: DateRule | null } = {}
    ) =>
      reopenClosure(
        {
          venueId,
          ruleId: rule.id,
          caller: over.caller ?? CALLER,
          tellCancelledGuests: tell,
          now: NOW,
          date,
          seen: over.seen === null ? undefined : { rule: over.seen ?? rule, children: [] },
        },
        client
      );
    const ruleOfOutcome = async (reservationId: string) =>
      (await inVenue((tx) => tx.closureOutcome.findMany({ where: { venueId, reservationId } })))
        .map((o) => o.dateRuleId)
        .sort();
    const rules = () =>
      inVenue((tx) => tx.dateRule.findMany({ where: { venueId }, orderBy: { startsOn: "asc" } }));
    const activeRules = async () => (await rules()).filter((r) => r.deletedAt === null);
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
      serviceId,
      inVenue,
      book,
      rangeOf,
      cancelAll,
      reopen,
      ruleOfOutcome,
      rules,
      activeRules,
      totalOf,
      revert,
    };
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);
    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  // After each test, so at most one of this file's venues exists at a time.
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

  it("splits the range, follows each guest to their date's rule, and Undo puts it all back", async () => {
    const w = await world();
    const [mon, tue, wed] = [await w.book(DAYS[0]), await w.book(DAYS[1]), await w.book(DAYS[2])];
    const range = w.rangeOf(DAYS[0], DAYS[2]);
    await w.cancelAll(range);
    expect(await w.totalOf(range.id)).toBe(3);

    const out = await w.reopen(range, DAYS[1], false);
    if (out.kind !== "reopened") throw new Error(`reopen ${out.kind}`);
    expect(out.result.notified).toBe(0);

    const active = await w.activeRules();
    expect(
      active.map((r) => [
        r.startsOn.toISOString().slice(0, 10),
        r.endsOn?.toISOString().slice(0, 10),
      ])
    ).toEqual([
      [DAYS[0], DAYS[0]],
      [DAYS[2], DAYS[2]],
    ]);
    const [before, after] = active;
    // Every outcome is on exactly one rule: Monday's and Wednesday's on the dates that stay shut,
    // Tuesday's on the removed range, and none twice.
    expect(await w.ruleOfOutcome(mon)).toEqual([before!.id]);
    expect(await w.ruleOfOutcome(wed)).toEqual([after!.id]);
    expect(await w.ruleOfOutcome(tue)).toEqual([range.id]);
    expect(await w.totalOf(before!.id)).toBe(1);
    expect(await w.totalOf(after!.id)).toBe(1);
    expect(await w.totalOf(range.id)).toBe(1);

    // Nobody was told, so Undo is offered and restores the range and each outcome's rule.
    const reverted = await w.revert(out.result);
    expect(reverted.kind).toBe("saved");
    expect((await w.activeRules()).map((r) => r.id)).toEqual([range.id]);
    for (const id of [mon, tue, wed]) expect(await w.ruleOfOutcome(id)).toEqual([range.id]);
    expect(await w.totalOf(range.id)).toBe(3);
  });

  it("trims an edge date and leaves one rule for the rest", async () => {
    const w = await world();
    const first = await w.book(DAYS[0]);
    const second = await w.book(DAYS[1]);
    const range = w.rangeOf(DAYS[0], DAYS[1]);
    await w.cancelAll(range);

    const out = await w.reopen(range, DAYS[0], false);
    expect(out.kind).toBe("reopened");
    const [rest] = await w.activeRules();
    expect(rest!.startsOn.toISOString().slice(0, 10)).toBe(DAYS[1]);
    expect(await w.ruleOfOutcome(second)).toEqual([rest!.id]);
    expect(await w.ruleOfOutcome(first)).toEqual([range.id]);
  });

  it("tells only the guests on the reopened date, and then offers no Undo", async () => {
    const w = await world();
    const [mon, tue, wed] = [await w.book(DAYS[0]), await w.book(DAYS[1]), await w.book(DAYS[2])];
    const range = w.rangeOf(DAYS[0], DAYS[2]);
    await w.cancelAll(range);

    const out = await w.reopen(range, DAYS[1], true);
    if (out.kind !== "reopened") throw new Error(`reopen ${out.kind}`);
    expect(out.result.notified).toBe(1);

    // The route enqueues notices for the reopened rule's id: that is Tuesday's guest alone.
    const told = await w.inVenue((tx) => listNotifiable(w.venueId, range.id, "reopened", NOW, tx));
    const tuesdays = await w.inVenue((tx) =>
      tx.closureOutcome.findMany({ where: { venueId: w.venueId, reservationId: tue } })
    );
    expect(told.map((o) => o.outcomeId)).toEqual(tuesdays.map((o) => o.id));
    for (const id of [mon, wed]) {
      const [rule] = await w.ruleOfOutcome(id);
      expect(rule).not.toBe(range.id);
    }

    const page = await listAvailabilityChanges(w.venueId, { limit: 5, offset: 0 } as never, client);
    expect(page?.undoable).toBeNull();
    expect((await w.revert(out.result)).kind).toBe("refused");
  });

  it("refuses a reopen built from a range a teammate has since changed, and changes nothing", async () => {
    const w = await world();
    const mon = await w.book(DAYS[0]);
    await w.book(DAYS[1]);
    const range = w.rangeOf(DAYS[0], DAYS[2]);
    await w.cancelAll(range);

    // A teammate shortens the range after this caller read it.
    await w.inVenue((tx) =>
      tx.dateRule.update({
        where: { id: range.id },
        data: { endsOn: new Date(`${DAYS[1]}T00:00:00Z`) },
      })
    );
    const out = await w.reopen(range, DAYS[1], false);
    expect(out.kind).toBe("version_conflict");
    expect((await w.activeRules()).map((r) => r.id)).toEqual([range.id]);
    expect(await w.ruleOfOutcome(mon)).toEqual([range.id]);
  });

  it("lets exactly one of two racing reopens of the same range commit", async () => {
    const w = await world();
    await w.book(DAYS[0]);
    await w.book(DAYS[1]);
    await w.book(DAYS[2]);
    const range = w.rangeOf(DAYS[0], DAYS[2]);
    await w.cancelAll(range);

    const results = await Promise.all([
      w.reopen(range, DAYS[0], false),
      w.reopen(range, DAYS[2], false),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(["not_found", "reopened"]);
    // No outcome was lost or doubled by the loser.
    const total = await w.inVenue((tx) =>
      tx.closureOutcome.count({ where: { venueId: w.venueId } })
    );
    expect(total).toBe(3);
  });

  it.each([
    ["no `seen`", { seen: null }, "invalid"],
    [
      "a Host",
      { caller: { isManager: false, actorId: "auth0|host", actorName: "Host" } },
      "forbidden",
    ],
  ])("refuses a one-date reopen from %s", async (_name, over, kind) => {
    const w = await world();
    await w.book(DAYS[0]);
    const range = w.rangeOf(DAYS[0], DAYS[2]);
    await w.cancelAll(range);
    const out = await w.reopen(range, DAYS[1], false, over as never);
    expect(out.kind).toBe(kind);
    expect((await w.activeRules()).map((r) => r.id)).toEqual([range.id]);
  });

  it("refuses a Host with the emergency grant who sends a date for their own one-date close", async () => {
    const w = await world({ hostGrant: true });
    const host = { isManager: false, actorId: "auth0|host", actorName: "Host" };
    // Today's whole-venue close: the one range a Host may make, and the only one they may reopen.
    const today = w.rangeOf("2026-12-20", "2026-12-20");
    await w.cancelAll(today, host);
    // Reopening it whole is theirs to do; naming a date is a Manager's split.
    const out = await w.reopen(today, "2026-12-20", false, { caller: host });
    expect(out.kind).toBe("forbidden");
    expect((await w.activeRules()).map((r) => r.id)).toEqual([today.id]);
  });

  it("does not falsely refuse a split of special hours whose kept dates have a booking in the extra hours", async () => {
    const w = await world();
    const late = {
      ...w.rangeOf(DAYS[0], DAYS[2]),
      kind: "special_hours" as const,
      // Open until 2 AM: later than the regular week, which closes at 11 PM.
      payload: {
        version: 1 as const,
        services: [
          {
            venueServiceId: w.serviceId,
            opensAt: 1020,
            lastSeatingAt: 1500,
            closesAt: 1560,
            seating: { version: 1 as const, interval: 15 },
            bookingTypes: ["online" as const, "phone" as const],
          },
        ],
      },
    } as DateRule;
    await w.cancelAll(late);
    // 12:30 AM after the third night: it belongs to DAYS[2], which keeps the late hours.
    await w.book(DAYS[2], `${DAYS[3]}T00:30:00Z`);

    const out = await w.reopen(late, DAYS[1], false);
    expect(out.kind).toBe("reopened");
    expect((await w.activeRules()).map((r) => r.startsOn.toISOString().slice(0, 10))).toEqual([
      DAYS[0],
      DAYS[2],
    ]);
  });

  describe("a date that is not on the calendar", () => {
    it("is refused with nothing reopened, and the next closure save still works", async () => {
      const w = await world();
      const range = w.rangeOf("2027-02-25", "2027-03-02");
      await w.cancelAll(range);

      const out = await w.reopen(range, "2027-02-31", false);
      expect(out.kind).toBe("invalid");
      expect((await w.activeRules()).map((r) => r.id)).toEqual([range.id]);
      expect(
        await w.inVenue((tx) =>
          tx.availabilityChange.count({ where: { venueId: w.venueId, kind: "reopen" } })
        )
      ).toBe(0);
      // On a range that runs past the 3rd the rolled-over date is a real one inside it: only the
      // calendar check stops this from reopening 03-03 while recording 02-31.
      const longer = w.rangeOf("2027-02-25", "2027-03-10");
      await w.cancelAll(longer);
      expect((await w.reopen(longer, "2027-02-31", false)).kind).toBe("invalid");
      expect((await w.activeRules()).map((r) => r.id).sort()).toEqual([range.id, longer.id].sort());
      // The inverted rule that used to be left behind refused every later save.
      await expect(w.cancelAll(w.rangeOf("2027-04-01", "2027-04-02"))).resolves.toBeDefined();
    });

    it("cannot hold up a reopen on a venue that already holds some other invalid rule", async () => {
      const w = await world();
      const whole = w.rangeOf(DAYS[3], DAYS[4]);
      const split = w.rangeOf(DAYS[0], DAYS[2]);
      await w.cancelAll(whole);
      await w.cancelAll(split);
      // An unrelated rule that ends before it starts, as an earlier bug left behind.
      await w.inVenue((tx) =>
        tx.dateRule.create({
          data: {
            id: `bad-${randomUUID()}`,
            venueId: w.venueId,
            createdBy: "auth0|legacy",
            kind: "closure",
            targetKind: "venue",
            startsOn: new Date("2027-03-04T00:00:00Z"),
            endsOn: new Date("2027-03-02T00:00:00Z"),
          },
        })
      );

      expect((await w.reopen(whole, undefined, false)).kind).toBe("reopened");
      expect((await w.reopen(split, DAYS[1], false)).kind).toBe("reopened");
    });
  });

  it("links a one-date reopen to its own day in History, not to the range it was cut from", async () => {
    const w = await world();
    const range = w.rangeOf(DAYS[0], DAYS[3]);
    await w.cancelAll(range);
    await w.reopen(range, DAYS[1], false);
    const change = await w.inVenue((tx) =>
      tx.availabilityChange.findFirstOrThrow({ where: { venueId: w.venueId, kind: "reopen" } })
    );
    expect(change.affectedFrom?.toISOString().slice(0, 10)).toBe(DAYS[1]);
    expect(change.affectedTo?.toISOString().slice(0, 10)).toBe(DAYS[1]);
  });
});
