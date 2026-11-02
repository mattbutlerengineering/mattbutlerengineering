import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { createClosure } from "./closure-command.js";
import { loadNoticeOutcome } from "./closure-notice-store.js";

/**
 * Real-Postgres proof for #8131: the closure notice promises a refund only where the closure owes
 * one, for the amount it owes, and says the same thing before and after the refund job runs.
 *
 * A real `createClosure` cancels a booking per case below. The notice is loaded as the closure left
 * it, then again after the refund job has run: a held deposit is `refunded`, a captured one has the
 * closure's own refund in `postCaptureRefundCents` (the `charge.refunded` webhook), and the outcome
 * is `done`. That second read is what a delayed or retried notice job sees; it must not go silent
 * (the deposit now computes 0 owed) and must not change the amount.
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
  status: "pending" | "held" | "refunded" | "applied";
  paymentIntent: string | null;
  /** Refunded outside the app (Stripe dashboard) before the closure. */
  dashboardRefundCents?: number;
  /** What the guest is told; null = nothing. */
  promised: number | null;
};

const CASES: Case[] = [
  { name: "held", status: "held", paymentIntent: "pi_held", promised: 4000 },
  { name: "refunded", status: "refunded", paymentIntent: "pi_refunded", promised: null },
  { name: "captured with intent", status: "applied", paymentIntent: "pi_a", promised: 4000 },
  { name: "captured without intent", status: "applied", paymentIntent: null, promised: null },
  {
    name: "captured, $15 refunded in the dashboard",
    status: "applied",
    paymentIntent: "pi_part",
    dashboardRefundCents: 1500,
    promised: 2500,
  },
  {
    name: "captured, $40 refunded in the dashboard",
    status: "applied",
    paymentIntent: "pi_full",
    dashboardRefundCents: 4000,
    promised: null,
  },
  { name: "pending, never sent to Stripe", status: "pending", paymentIntent: null, promised: null },
  { name: "pending with an intent", status: "pending", paymentIntent: "pi_pend", promised: 4000 },
];
const NAMES = [...CASES.map((c) => c.name), "no deposit"];

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

  const noticeRefund = (name: string) =>
    inVenue(async (tx) => (await loadNoticeOutcome(outcomeIds.get(name)!, tx))?.refund);
  const expected = (promised: number | null) =>
    promised === null ? null : { amountCents: promised, currency: "usd" };

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
      const table = await tx.table.create({ data: { name: "T1", capacity: 4, venueId } });
      for (const [i, name] of NAMES.entries()) {
        const c = CASES.find((x) => x.name === name);
        // Half-hour slots from 17:00, all inside the seated window.
        const start = new Date(Date.parse("2026-12-24T17:00:00Z") + i * 30 * 60_000);
        const reservation = await tx.reservation.create({
          data: {
            venueId,
            tableId: table.id,
            date: new Date("2026-12-24T00:00:00Z"),
            startTime: start,
            endTime: new Date(start.getTime() + 30 * 60_000),
            partySize: 2,
            status: "CONFIRMED",
            guestName: name,
            guestEmail: `${i}@example.com`,
          },
        });
        reservationIds.set(name, reservation.id);
        if (c) {
          await tx.deposit.create({
            data: {
              reservationId: reservation.id,
              amountCents: 4000,
              currency: "usd",
              status: c.status,
              stripePaymentIntentId: c.paymentIntent,
              postCaptureRefundCents: c.dashboardRefundCents ?? null,
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
    expect(closed).toMatchObject({ kind: "saved", result: { outcomes: { cancel: NAMES.length } } });

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

  it.each(CASES)("before the job, $name: promises $promised", async ({ name, promised }) => {
    expect(await noticeRefund(name)).toEqual(expected(promised));
  });

  it("promises nothing to a booking with no deposit", async () => {
    expect(await noticeRefund("no deposit")).toBeNull();
  });

  it("says the same after the refund job has run, for every case", async () => {
    await inVenue(async (tx) => {
      for (const c of CASES.filter((x) => x.promised !== null)) {
        const reservationId = reservationIds.get(c.name)!;
        // What the job leaves behind: a held deposit refunded; a captured one with the closure's
        // own refund lifting postCaptureRefundCents to the whole deposit (so it computes 0 owed).
        await tx.deposit.updateMany({
          where: { reservationId },
          data:
            c.status === "applied"
              ? { postCaptureRefundCents: 4000 }
              : { status: "refunded", refundedAt: NOW },
        });
        await tx.closureOutcome.update({
          where: { id: outcomeIds.get(c.name)! },
          data: { refund: "done" },
        });
      }
    });
    const after = Object.fromEntries(
      await Promise.all(CASES.map(async (c) => [c.name, await noticeRefund(c.name)] as const))
    );
    expect(after).toEqual(Object.fromEntries(CASES.map((c) => [c.name, expected(c.promised)])));
  });
});
