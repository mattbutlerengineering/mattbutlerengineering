import { addDays, validateConfig } from "@mbe/availability";
import type { ClosureAlongside, ClosureImpact, DateRule } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { referenceIssues, SCOPE_CONFLICT_HORIZON_DAYS } from "./availability-config-plan.js";
import { loadConfigState, stillToServeWhere, type ConfigState } from "./availability-config.js";
import { civilDateIn } from "./availability-migration.js";
import {
  computeClosureImpact,
  withClosure,
  type ImpactBooking,
  type Occupancy,
} from "./closure-impact.js";
import { prisma } from "./database.js";
import { activeHoldWindow, NOT_BOOKED_STATUSES } from "./slot-rules.js";

/**
 * Loads what `computeClosureImpact` needs for a draft date rule, read-only and
 * inside the venue's RLS context (architecture.md § Closure command: the
 * affected-set preview is the closure's own query, run without writing).
 */

type StoreClient = Pick<PrismaClient, "$transaction">;
type ImpactDb = Pick<PrismaClient, "table" | "reservation" | "reservationHold">;

export type ClosureImpactOutcome =
  | { kind: "ok"; impact: ClosureImpact }
  | { kind: "not_found" }
  | { kind: "too_long" }
  | { kind: "invalid"; issues: { path: string; code: string; message: string }[] };

/** Deposits that still hold or await the guest's money: a cancel owes them a refund or void. */
const LIVE_DEPOSIT_STATUSES: ReadonlySet<string> = new Set(["pending", "held"]);

/**
 * Deposits staff captured (`/deposits/:id/capture` takes any held deposit, seated or not) or
 * forfeited before the closure: the money is gone from the authorization, but a cancel still owes
 * it back through Stripe's refund API. Only with a payment intent; without one there is nothing to
 * refund through Stripe.
 */
const CAPTURED_DEPOSIT_STATUSES: ReadonlySet<string> = new Set([
  "applied",
  "forfeited",
  "partial_refunded",
]);

const owesRefund = (d: { status: string; stripePaymentIntentId: string | null }): boolean =>
  LIVE_DEPOSIT_STATUSES.has(d.status) ||
  (CAPTURED_DEPOSIT_STATUSES.has(d.status) && Boolean(d.stripePaymentIntentId));

const toDbDate = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

/**
 * The service dates to scan, or null when an explicit range is over a year.
 * From yesterday at the earliest: a service running past midnight is still
 * yesterday's (ADR-029), and earlier days have no future booking. An
 * open-ended rule is scanned a year ahead.
 */
function scanRange(rule: DateRule, today: string): { from: string; to: string } | null {
  const earliest = addDays(today, -1);
  const from = rule.startsOn > earliest ? rule.startsOn : earliest;
  // The year is counted from the first date that can hold a booking, so a series that began long
  // ago (an "All dates" edit keeps its start) is not "too long".
  if (rule.endsOn && rule.endsOn > addDays(from, SCOPE_CONFLICT_HORIZON_DAYS)) return null;
  return { from, to: rule.endsOn ?? addDays(from, SCOPE_CONFLICT_HORIZON_DAYS) };
}

/**
 * Who holds the tables the affected bookings sit on, over the days a move can land on: every live
 * booking (the unaffected ones too) and every unexpired hold, the two things `closure-apply`'s
 * `targetTaken` refuses a move for. A move stays within a service day (ADR-029), so a day either
 * side of the scanned range covers a service that runs past midnight.
 */
async function loadOccupancy(
  tx: ImpactDb,
  venueId: string,
  tableIds: readonly string[],
  range: { from: string; to: string },
  now: Date
): Promise<Occupancy> {
  if (tableIds.length === 0) return { reservations: [], holds: [] };
  const date = { gte: toDbDate(addDays(range.from, -1)), lte: toDbDate(addDays(range.to, 1)) };
  const [reservations, holds] = await Promise.all([
    tx.reservation.findMany({
      where: {
        venueId,
        tableId: { in: [...tableIds] },
        date,
        status: { notIn: [...NOT_BOOKED_STATUSES] },
      },
      select: { id: true, tableId: true, startTime: true, endTime: true, partySize: true },
    }),
    tx.reservationHold.findMany({
      where: { venueId, tableId: { in: [...tableIds] }, date, expiresAt: activeHoldWindow(now) },
      select: {
        id: true,
        tableId: true,
        startTime: true,
        endTime: true,
        partySize: true,
        expiresAt: true,
      },
    }),
  ]);
  return { reservations, holds };
}

/**
 * The impact of a draft rule against an already-loaded config state, inside
 * the caller's transaction. The closure command runs this same query before
 * it writes.
 */
export async function impactInTransaction(
  tx: ImpactDb,
  venueId: string,
  state: ConfigState,
  rule: DateRule,
  now: Date,
  alongside?: ClosureAlongside
): Promise<ClosureImpactOutcome> {
  const tables = await tx.table.findMany({ where: { venueId }, select: { id: true } });
  const next = withClosure(state.effective, rule, alongside);
  const issues = [
    ...validateConfig(next),
    ...referenceIssues(next, new Set(tables.map((t) => t.id))),
  ];
  if (issues.length > 0) return { kind: "invalid", issues };

  const range = scanRange(rule, civilDateIn(now, state.timezone));
  if (!range) return { kind: "too_long" };

  const rows = await tx.reservation.findMany({
    where: {
      venueId,
      date: { gte: toDbDate(range.from), lte: toDbDate(range.to) },
      ...stillToServeWhere(now),
      status: { notIn: [...NOT_BOOKED_STATUSES] },
    },
    select: {
      id: true,
      tableId: true,
      date: true,
      startTime: true,
      endTime: true,
      partySize: true,
      guestName: true,
      originHost: true,
      deposit: {
        select: {
          amountCents: true,
          currency: true,
          status: true,
          stripePaymentIntentId: true,
        },
      },
    },
  });
  const bookings: ImpactBooking[] = rows.map(({ deposit, ...row }) => ({
    ...row,
    heldDeposit:
      deposit && owesRefund(deposit)
        ? { amountCents: deposit.amountCents, currency: deposit.currency }
        : null,
  }));
  const tableIds = [...new Set(bookings.flatMap((b) => (b.tableId ? [b.tableId] : [])))];
  const impact = computeClosureImpact({
    timezone: state.timezone,
    config: state.effective,
    rule,
    alongside,
    bookings,
    now,
    occupancy: await loadOccupancy(tx, venueId, tableIds, range, now),
  });
  return { kind: "ok", impact };
}

export async function getClosureImpact(
  venueId: string,
  rule: DateRule,
  now: Date,
  client: StoreClient = prisma,
  alongside?: ClosureAlongside
): Promise<ClosureImpactOutcome> {
  return client.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    const state = await loadConfigState(tx, venueId, now);
    if (!state) return { kind: "not_found" as const };
    return impactInTransaction(tx, venueId, state, rule, now, alongside);
  });
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const closureImpactService = { impact: getClosureImpact };
