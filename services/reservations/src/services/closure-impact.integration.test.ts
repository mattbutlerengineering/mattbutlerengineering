import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ClosureImpact, DateRule } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import { createClosure } from "./closure-command.js";
import { getClosureImpact } from "./closure-impact-store.js";

/**
 * Real-Postgres proof that the move times Step 2 proposes are the moves the save makes (#7983):
 * consecutive bookings on one table, a move onto an unaffected booking and a move onto an active
 * hold are all refused by `closure-apply`'s `targetTaken`, so the impact must propose `null` for
 * them, and a proposal it does make must be one the save accepts.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it. Shares the FORCE-toggling
 * suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const NOW = new Date("2026-12-20T12:00:00Z");
const CALLER = { isManager: true, actorId: "auth0|ana", actorName: "Ana" };

describe.skipIf(!DATABASE_URL)("proposed moves match the save (real Postgres)", () => {
  const venueId = `impact-it-${randomUUID()}`;
  /** Booking ids are unique per run: the rows outlive it. */
  const P = `${randomUUID().slice(0, 8)}-`;
  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;
  let serviceId = "";
  let t1 = "";
  let t2 = "";

  function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  /** Dinner cut to 4:00-8:00 PM, last seating 6:00 PM, on `date` (UTC venue). */
  const shortened = (date: string): DateRule => ({
    id: `dr-${randomUUID()}`,
    kind: "special_hours",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    payload: {
      version: 1,
      services: [
        {
          venueServiceId: serviceId,
          opensAt: 960,
          lastSeatingAt: 1080,
          closesAt: 1200,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      ],
    },
  });

  /** An hour-long booking after the new close, so the shortened hours strand it. */
  async function book(id: string, tableId: string, date: string, hh: number, minutes = 60) {
    const startTime = new Date(`${date}T${String(hh).padStart(2, "0")}:00:00Z`);
    await inVenue((tx) =>
      tx.reservation.create({
        data: {
          id: P + id,
          venueId,
          tableId,
          date: new Date(`${date}T00:00:00Z`),
          startTime,
          endTime: new Date(startTime.getTime() + minutes * 60_000),
          partySize: 2,
          status: "CONFIRMED",
          guestName: `Guest ${id}`,
        },
      })
    );
  }

  const impactOf = (rule: DateRule): Promise<ClosureImpact> =>
    getClosureImpact(venueId, rule, NOW, client).then((o) => {
      if (o.kind !== "ok") throw new Error(`impact ${o.kind}`);
      return o.impact;
    });

  const proposals = (impact: ClosureImpact) =>
    Object.fromEntries(
      impact.groups.flatMap((g) =>
        g.reservations.map((r) => [r.id.slice(P.length), r.proposedStart ?? "none"])
      )
    );

  /** Saves the rule with every group on Move, as the Manager would after Step 2. */
  async function saveMoving(rule: DateRule, impact: ClosureImpact) {
    const version = (await inVenue((tx) => tx.venue.findUniqueOrThrow({ where: { id: venueId } })))
      .availabilityVersion;
    return createClosure(
      {
        venueId,
        caller: CALLER,
        idempotencyKey: randomUUID(),
        now: NOW,
        body: {
          expectedVersion: version,
          rule,
          decisions: impact.groups.map((g) => ({
            groupKey: g.groupKey,
            action: "move" as const,
            reservationIds: g.reservations.map((r) => r.id),
          })),
        },
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
        data: { id: venueId, name: "Impact IT", slug: venueId, ianaTimezone: "UTC" },
      });
      const schedule = await tx.schedule.create({
        data: { venueId, name: "Regular", kind: "regular", isRegular: true },
      });
      const service = await tx.venueService.create({ data: { venueId, name: "Dinner" } });
      serviceId = service.id;
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
      t1 = (await tx.table.create({ data: { venueId, name: "T1", capacity: 4 } })).id;
      t2 = (await tx.table.create({ data: { venueId, name: "T2", capacity: 4 } })).id;
    });
  });

  afterAll(async () => {
    await lockClient?.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient?.end();
    await client?.$disconnect();
    await pool?.end();
  });

  it("proposes a table's second consecutive booking nothing, and the save refuses exactly that one", async () => {
    const date = "2026-12-24";
    await book("a", t1, date, 20);
    await book("b", t1, date, 21);
    await book("c", t2, date, 21);
    const rule = shortened(date);

    const impact = await impactOf(rule);

    expect(proposals(impact)).toEqual({
      a: "2026-12-24T18:00:00.000Z",
      b: "none",
      c: "2026-12-24T18:00:00.000Z",
    });
    expect(impact.groups[0]!.reservations.find((r) => r.id === `${P}b`)!.proposedStart).toBeNull();
    expect(await saveMoving(rule, impact)).toEqual({
      kind: "move_unavailable",
      reservationIds: [`${P}b`],
    });
  });

  it("proposes nothing onto an unaffected booking, and the save refuses it too", async () => {
    const date = "2026-12-25";
    await book("d", t1, date, 20);
    await book("kept", t1, date, 17, 90); // 5:00-6:30 PM: still served, and over 6:00 PM
    const rule = shortened(date);

    const impact = await impactOf(rule);

    expect(proposals(impact)).toEqual({ d: "none" });
    expect(await saveMoving(rule, impact)).toMatchObject({
      kind: "move_unavailable",
      reservationIds: [`${P}d`],
    });
  });

  it("proposes nothing onto an active hold, and the save refuses it too", async () => {
    const date = "2026-12-26";
    await book("e", t2, date, 20);
    await inVenue((tx) =>
      tx.reservationHold.create({
        data: {
          venueId,
          tableId: t2,
          date: new Date(`${date}T00:00:00Z`),
          startTime: new Date(`${date}T18:00:00Z`),
          endTime: new Date(`${date}T19:00:00Z`),
          partySize: 2,
          sessionId: "s1",
          expiresAt: new Date(NOW.getTime() + 10 * 60_000),
        },
      })
    );
    const rule = shortened(date);

    const impact = await impactOf(rule);

    expect(proposals(impact)).toEqual({ e: "none" });
    expect(await saveMoving(rule, impact)).toMatchObject({
      kind: "move_unavailable",
      reservationIds: [`${P}e`],
    });
  });

  it("makes the move it proposed when nothing stands in the way", async () => {
    const date = "2026-12-27";
    await book("f", t1, date, 20);
    const rule = shortened(date);

    const impact = await impactOf(rule);
    expect(proposals(impact)).toEqual({ f: "2026-12-27T18:00:00.000Z" });

    expect(await saveMoving(rule, impact)).toMatchObject({ kind: "saved" });
    const moved = await inVenue((tx) =>
      tx.reservation.findUniqueOrThrow({ where: { id: `${P}f` } })
    );
    expect(moved.startTime.toISOString()).toBe("2026-12-27T18:00:00.000Z");
  });
});
