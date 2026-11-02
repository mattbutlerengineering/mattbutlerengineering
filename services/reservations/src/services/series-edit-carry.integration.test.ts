import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ClosureAlongside, DateRule } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import { revertAvailabilityChange } from "./availability-changes.js";
import { createClosure } from "./closure-command.js";
import { getClosureImpact } from "./closure-impact-store.js";
import { listSummaries } from "./closure-notice-store.js";

/**
 * Real-Postgres proof for #7984: a series edit that grows the series saves it under a new rule id
 * (`series-edit.ts` `growthClosure`), and the guests the old rule cancelled, with their counts and
 * call list, follow it to the new id instead of dropping off the row. Undoing a growth that told no
 * guest (every group kept silently) puts them back where they were: Undo is exact against the state
 * the change left.
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

describe.skipIf(!DATABASE_URL)("a grown series keeps its outcomes (real Postgres)", () => {
  const venueId = `carry-it-${randomUUID()}`;
  const P = `${randomUUID().slice(0, 8)}-`;
  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;
  let tableId = "";

  function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  async function book(id: string, date: string) {
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
        },
      })
    );
  }

  const versionNow = async () =>
    (await inVenue((tx) => tx.venue.findUniqueOrThrow({ where: { id: venueId } })))
      .availabilityVersion;

  /** Saves `rule` (with `alongside` when it replaces a series), deciding every group `action`. */
  async function save(
    rule: DateRule,
    action: "cancel" | "keep_silent",
    alongside?: ClosureAlongside
  ) {
    const found = await getClosureImpact(venueId, rule, NOW, client, alongside);
    if (found.kind !== "ok") throw new Error(`impact ${found.kind}`);
    const saved = await createClosure(
      {
        venueId,
        caller: CALLER,
        idempotencyKey: randomUUID(),
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
  }

  const seriesOf = (id: string, weekdays: number[]): DateRule => ({
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn: MONDAY,
    endsOn: "2027-01-31",
    repeat: { version: 1, weekdays },
    guestMessage: "Closed on Mondays",
  });

  const totalOf = async (ruleId: string) =>
    (await inVenue((tx) => listSummaries(venueId, NOW, tx))).find((s) => s.ruleId === ruleId)
      ?.total ?? 0;

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);
    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
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
  });

  afterAll(async () => {
    await lockClient?.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient?.end();
    await client?.$disconnect();
    await pool?.end();
  });

  it("carries the old rule's outcomes to the grown series, and Undo of a silent growth puts them back", async () => {
    await book("mon", MONDAY);
    await book("tue", TUESDAY);
    await book("wed", WEDNESDAY);

    const original = seriesOf(`s-${randomUUID()}`, [1]);
    await save(original, "cancel");
    expect(await totalOf(original.id)).toBe(1);

    // Mondays and Tuesdays: a new rule id, the original removed beside it.
    const grown = seriesOf(`s-${randomUUID()}`, [1, 2]);
    await save(grown, "cancel", { upsert: [], remove: [original.id], replaces: original });
    // Monday's cancelled guest and Tuesday's now sit on the one row the Manager sees.
    expect(await totalOf(grown.id)).toBe(2);
    expect(await totalOf(original.id)).toBe(0);

    // Adding Wednesday and keeping its booking tells nobody, so History can revert it.
    const grownAgain = seriesOf(`s-${randomUUID()}`, [1, 2, 3]);
    const silent = await save(grownAgain, "keep_silent", {
      upsert: [],
      remove: [grown.id],
      replaces: grown,
    });
    expect(await totalOf(grownAgain.id)).toBeGreaterThanOrEqual(2);
    expect(await totalOf(grown.id)).toBe(0);

    const undone = await revertAvailabilityChange(
      {
        venueId,
        changeId: silent.changeId,
        actorId: CALLER.actorId,
        expectedVersion: silent.version,
        now: NOW,
      },
      client
    );
    expect(undone.kind).toBe("saved");
    expect(await totalOf(grown.id)).toBe(2);
  });
});
