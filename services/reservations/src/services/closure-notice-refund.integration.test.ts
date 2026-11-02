import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { createClosure } from "./closure-command.js";
import { loadNoticeOutcome } from "./closure-notice-store.js";

/**
 * Real-Postgres proof for #8131: the closure notice promises a refund only where the closure
 * recorded one, and keeps promising it after the refund job has moved the deposit on.
 *
 * A real `createClosure` cancels five bookings (a held deposit, an already refunded one, a captured
 * one with and without a payment intent, and none). The notice is then loaded twice: as the closure
 * left it, and after the refund job ran (held -> refunded, outcome pending -> done), which is the
 * state a delayed or retried notice job sees.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it. Shares the FORCE-toggling
 * suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const NOW = new Date("2026-11-01T12:00:00Z");
const manager = { actorId: "auth0|mgr", actorName: "Mgr", isManager: true };

type Case = {
  name: string;
  status: "held" | "refunded" | "applied";
  paymentIntent: string | null;
  owed: boolean;
};

const CASES: Case[] = [
  { name: "held", status: "held", paymentIntent: "pi_held", owed: true },
  { name: "refunded", status: "refunded", paymentIntent: "pi_refunded", owed: false },
  { name: "captured with intent", status: "applied", paymentIntent: "pi_applied", owed: true },
  { name: "captured without intent", status: "applied", paymentIntent: null, owed: false },
];

describe.skipIf(!DATABASE_URL)("closure notice refund promise (real Postgres)", () => {
  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;
  const venueId = `notice-refund-it-${randomUUID()}`;
  const reservationIds = new Map<string, string>();
  const outcomeIds = new Map<string, string>();

  function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  const noticeRefund = (key: string) =>
    inVenue(async (tx) => (await loadNoticeOutcome(outcomeIds.get(key)!, tx))?.refund);

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);
    pool = new pg.Pool({ connectionString: DATABASE_URL!, max: 10 });
    client = new PrismaClient({
      adapter: new PrismaPg(pool),
      transactionOptions: { timeout: 30_000, maxWait: 30_000 },
    });

    await inVenue(async (tx) => {
      await tx.venue.create({
        data: {
          id: venueId,
          name: "Notice refund IT",
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
      const table = await tx.table.create({
        data: { name: "T1", capacity: 4, venueId },
      });
      const bookings = [...CASES, { name: "no deposit" }] as { name: string }[];
      for (const [i, b] of bookings.entries()) {
        const c = CASES.find((x) => x.name === b.name);
        const reservation = await tx.reservation.create({
          data: {
            venueId,
            tableId: table.id,
            date: new Date("2026-12-24T00:00:00Z"),
            startTime: new Date(`2026-12-24T${17 + i}:00:00Z`),
            endTime: new Date(`2026-12-24T${18 + i}:00:00Z`),
            partySize: 2,
            status: "CONFIRMED",
            guestName: b.name,
            guestEmail: `${i}@example.com`,
          },
        });
        reservationIds.set(b.name, reservation.id);
        if (c) {
          await tx.deposit.create({
            data: {
              reservationId: reservation.id,
              amountCents: 4000,
              currency: "usd",
              status: c.status,
              stripePaymentIntentId: c.paymentIntent,
            },
          });
        }
      }
    });

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
          decisions: [{ groupKey: "2026-12-24:closed", action: "cancel" }],
        } as never,
        idempotencyKey: `k-${ruleId}`,
        now: NOW,
      },
      client
    );
    expect(closed).toMatchObject({ kind: "saved", result: { outcomes: { cancel: 5 } } });

    const rows = await inVenue((tx) =>
      tx.closureOutcome.findMany({ where: { venueId }, select: { id: true, reservationId: true } })
    );
    for (const [name, reservationId] of reservationIds) {
      outcomeIds.set(name, rows.find((r) => r.reservationId === reservationId)!.id);
    }
  });

  afterAll(async () => {
    await lockClient?.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient?.end();
    await client?.$disconnect();
    await pool?.end();
  });

  it.each(CASES)("$name deposit: promised only if the closure owes it", async ({ name, owed }) => {
    const expected = owed ? { amountCents: 4000, currency: "usd" } : null;
    expect(await noticeRefund(name)).toEqual(expected);
  });

  it("promises nothing to a booking with no deposit", async () => {
    expect(await noticeRefund("no deposit")).toBeNull();
  });

  it("still promises the refund after the job has run (held -> refunded, pending -> done)", async () => {
    await inVenue(async (tx) => {
      await tx.deposit.updateMany({
        where: { reservationId: reservationIds.get("held")! },
        data: { status: "refunded", refundedAt: NOW },
      });
      await tx.closureOutcome.update({
        where: { id: outcomeIds.get("held")! },
        data: { refund: "done" },
      });
    });
    expect(await noticeRefund("held")).toEqual({ amountCents: 4000, currency: "usd" });
    expect(await noticeRefund("refunded")).toBeNull();
  });
});
