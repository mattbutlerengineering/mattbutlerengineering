import { addDays, rebookOffers } from "@mbe/availability";
import type { PrismaClient } from "../generated/prisma/index.js";
import { loadAvailabilitySnapshot } from "./availability-snapshot.js";
import { civilDateIn } from "./availability-migration.js";
import { refundOwedCents } from "./closure-deposit.js";
import { isOnCallList, type Deliveries, type NoticeOutcome } from "./closure-notice.js";
import { prisma } from "./database.js";
import { rebookRequiresDeposit } from "./manage-rebook-deps.js";

/**
 * Reads and writes behind CLOSURE_NOTICE. Every function runs through the
 * venue-scoped `prisma`, so the caller is already inside
 * `runWithVenueContext(venueId, …)` (the job handler and `venueScoped` routes
 * both are).
 */

type Db = Pick<PrismaClient, "closureOutcome">;
type RuleDb = Pick<PrismaClient, "dateRule">;

/** Where a closure begins, as stored: its first date and its window's start minute. */
export interface ClosureWindow {
  /** "YYYY-MM-DD", venue-local. */
  startsOn: string;
  /** "YYYY-MM-DD", venue-local; `null` = open-ended. */
  endsOn: string | null;
  /** Weekdays (0 = Sunday) a repeating rule covers; `null` = not repeating. */
  weekdays: number[] | null;
  /** Minute of the service day the window opens; `null` = the whole service day. */
  from: number | null;
  timezone: string;
}

function windowFrom(window: unknown): number | null {
  const from = (window as { from?: unknown } | null)?.from;
  return typeof from === "number" ? from : null;
}

function weekdaysOf(repeat: unknown): number[] | null {
  const weekdays = (repeat as { weekdays?: unknown } | null)?.weekdays;
  return Array.isArray(weekdays)
    ? weekdays.filter((d): d is number => typeof d === "number")
    : null;
}

/** The closure's start, for the per-closure urgency decision. A reopened rule is still read. */
export async function loadClosureWindow(
  venueId: string,
  ruleId: string,
  db: RuleDb = prisma
): Promise<ClosureWindow | null> {
  const rule = await db.dateRule.findFirst({
    where: { id: ruleId, venueId },
    select: {
      startsOn: true,
      endsOn: true,
      repeat: true,
      window: true,
      venue: { select: { ianaTimezone: true } },
    },
  });
  if (!rule) return null;
  return {
    startsOn: rule.startsOn.toISOString().slice(0, 10),
    endsOn: rule.endsOn ? rule.endsOn.toISOString().slice(0, 10) : null,
    weekdays: weekdaysOf(rule.repeat),
    from: windowFrom(rule.window),
    timezone: rule.venue.ianaTimezone,
  };
}

export interface NotifiableOutcome {
  outcomeId: string;
}

export type NoticeVariant = "closure" | "reopened";

/**
 * Who a closure notice goes to. A reopen notice goes only to cancelled guests whose booking has
 * not started: nobody is told to rebook a date that has passed.
 */
export async function listNotifiable(
  venueId: string,
  ruleId: string,
  variant: NoticeVariant,
  now: Date,
  db: Db = prisma
): Promise<NotifiableOutcome[]> {
  const rows = await db.closureOutcome.findMany({
    where:
      variant === "reopened"
        ? { venueId, dateRuleId: ruleId, action: "cancel", reservation: { startTime: { gt: now } } }
        : { venueId, dateRuleId: ruleId, action: { not: "keep_silent" } },
    select: { id: true },
  });
  return rows.map((r) => ({ outcomeId: r.id }));
}

/**
 * The refund the notice may promise: the amount the closure recorded it owed (`refundCents`,
 * written with the outcome row), only while the outcome still says a refund is coming. The
 * deposit's own columns are not read for the amount: once the refund job has run, `status` is
 * `refunded` or `postCaptureRefundCents` includes the closure's own refund, and a deposit that
 * is correctly refunded would compute 0 owed and the guest would go unnotified.
 *
 * Two reads can still change between the closure and the send. The refund job rewrites `pending`
 * to `none` when it finds nothing was charged (an intent that was never authorized), so a notice
 * sent before the job has run may promise money that the job later finds was never taken. And a
 * `pending` deposit with no payment intent never reached Stripe, so it is not promised even on a
 * row stored as `pending` (a retry cannot make it owed).
 */
function promisedRefund(
  refund: string,
  refundCents: number | null,
  deposit: {
    amountCents: number;
    currency: string;
    status: string;
    stripePaymentIntentId: string | null;
    refundAmountCents: number | null;
    postCaptureRefundCents: number | null;
  } | null
): NoticeOutcome["refund"] {
  if (!deposit || refund === "none") return null;
  if (deposit.status === "pending" && !deposit.stripePaymentIntentId) return null;
  // A row from before `refundCents` existed: once the job is done the closure's own refund is
  // already off the row (it would compute 0), so promise the deposit; before that, estimate.
  const amountCents =
    refundCents ?? (refund === "done" ? deposit.amountCents : refundOwedCents(deposit));
  return amountCents > 0 ? { amountCents, currency: deposit.currency } : null;
}

export async function loadNoticeOutcome(
  outcomeId: string,
  db: Db = prisma
): Promise<NoticeOutcome | null> {
  const row = await db.closureOutcome.findUnique({
    where: { id: outcomeId },
    select: {
      id: true,
      venueId: true,
      reservationId: true,
      action: true,
      deliveries: true,
      rebookedReservationId: true,
      refund: true,
      refundCents: true,
      dateRule: { select: { guestMessage: true } },
      venue: { select: { name: true, ianaTimezone: true } },
      reservation: {
        select: {
          date: true,
          startTime: true,
          partySize: true,
          guestName: true,
          guestEmail: true,
          guestPhone: true,
          guest: { select: { communicationPreference: true } },
          deposit: {
            select: {
              amountCents: true,
              currency: true,
              status: true,
              stripePaymentIntentId: true,
              refundAmountCents: true,
              postCaptureRefundCents: true,
            },
          },
          originHost: true,
        },
      },
    },
  });
  if (!row) return null;
  const r = row.reservation;
  return {
    outcomeId: row.id,
    venueId: row.venueId,
    reservationId: row.reservationId,
    action: row.action,
    deliveries: row.deliveries as Deliveries,
    rebooked: row.rebookedReservationId !== null,
    closureDate: r.date.toISOString().slice(0, 10),
    message: row.dateRule.guestMessage,
    startTime: r.startTime,
    partySize: r.partySize,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    guestPhone: r.guestPhone,
    preference: r.guest?.communicationPreference ?? null,
    refund: promisedRefund(row.refund, row.refundCents, r.deposit),
    venueName: row.venue.name,
    timezone: row.venue.ianaTimezone,
    originHost: r.originHost,
  };
}

export async function recordDeliveries(
  outcomeId: string,
  deliveries: Deliveries,
  db: Db = prisma
): Promise<void> {
  await db.closureOutcome.update({
    where: { id: outcomeId },
    data: { deliveries },
  });
}

/**
 * Up to 3 open online slots in the next 14 days (SC Rebooking offer), computed
 * when the notice is sent so they are still open as the message goes out.
 * The original start is excluded by `rebookOffers`. None where the rebook
 * would need a deposit: `/manage/rebook` refuses those (422), so the notice
 * links the full picker instead.
 */
export async function loadRebookSlots(o: NoticeOutcome, now: Date): Promise<Date[]> {
  const contact = { guestEmail: o.guestEmail, guestPhone: o.guestPhone };
  if (await rebookRequiresDeposit(o.venueId, contact)) return [];
  const today = civilDateIn(now, o.timezone);
  const { snapshot } = await loadAvailabilitySnapshot(o.venueId, today, addDays(today, 14), now);
  const result = rebookOffers(snapshot, { startTime: o.startTime, partySize: o.partySize }, now);
  return result.kind === "offers" ? result.slots.map((s) => s.start) : [];
}

export interface CallListEntry {
  outcomeId: string;
  reservationId: string;
  guestName: string | null;
  partySize: number;
  startTime: Date;
  guestPhone: string | null;
}

/**
 * Guests not yet confirmed delivered or rebooked: name, party, time and phone,
 * for the printable call list (ux.md F6). A guest whose notice failed, was
 * skipped for lack of contact, or has not been sent yet is on it.
 */
export async function listCallList(
  venueId: string,
  ruleId: string,
  db: Db = prisma
): Promise<CallListEntry[]> {
  const rows = await db.closureOutcome.findMany({
    where: { venueId, dateRuleId: ruleId },
    orderBy: { reservation: { startTime: "asc" } },
    select: {
      id: true,
      reservationId: true,
      action: true,
      deliveries: true,
      rebookedReservationId: true,
      reservation: {
        select: { guestName: true, partySize: true, startTime: true, guestPhone: true },
      },
    },
  });
  return rows
    .filter((row) =>
      isOnCallList({
        action: row.action,
        deliveries: row.deliveries as Deliveries,
        rebooked: row.rebookedReservationId !== null,
      })
    )
    .map((row) => ({
      outcomeId: row.id,
      reservationId: row.reservationId,
      guestName: row.reservation.guestName,
      partySize: row.reservation.partySize,
      startTime: row.reservation.startTime,
      guestPhone: row.reservation.guestPhone,
    }));
}

export interface ClosureSummary {
  ruleId: string;
  total: number;
  cancelled: number;
  sent: number;
  rebooked: number;
  unreachable: number;
  refundFailed: number;
  /** The failed refunds by guest and amount; no contact details. */
  refundFailures: RefundFailure[];
  refundPending: number;
}

export interface RefundFailure {
  outcomeId: string;
  guestName: string | null;
  amountCents: number | null;
  currency: string | null;
}

interface SummaryRow {
  id: string;
  reservation: {
    guestName: string | null;
    /** Only the summaries listing reads when the booking starts. */
    startTime?: Date;
    deposit: {
      amountCents: number;
      currency: string;
      status: string;
      refundAmountCents: number | null;
      postCaptureRefundCents: number | null;
    } | null;
  };
  dateRuleId: string;
  action: NoticeOutcome["action"];
  deliveries: unknown;
  rebookedReservationId: string | null;
  refund: string;
  /** What the guest was promised, as stored with the outcome; null on rows from before it. */
  refundCents?: number | null;
}

const EMPTY_SUMMARY = {
  total: 0,
  cancelled: 0,
  sent: 0,
  rebooked: 0,
  unreachable: 0,
  refundFailed: 0,
  refundFailures: [] as RefundFailure[],
  refundPending: 0,
};

function refundFailureOf(row: SummaryRow): RefundFailure {
  const { guestName, deposit } = row.reservation;
  return {
    outcomeId: row.id,
    guestName,
    // What the guest was promised, from the outcome; the live deposit only for older rows.
    amountCents: deposit ? (row.refundCents ?? refundOwedCents(deposit)) : null,
    currency: deposit?.currency ?? null,
  };
}

/** Folds outcome rows into one summary per date rule, in first-seen order. */
export function summarizeOutcomes(rows: readonly SummaryRow[]): ClosureSummary[] {
  const byRule = new Map<string, ClosureSummary>();
  for (const row of rows) {
    const deliveries = row.deliveries as Deliveries;
    const rebooked = row.rebookedReservationId !== null;
    const prev = byRule.get(row.dateRuleId) ?? { ruleId: row.dateRuleId, ...EMPTY_SUMMARY };
    const confirmed = deliveries.email === "sent" || deliveries.sms === "sent";
    byRule.set(row.dateRuleId, {
      ...prev,
      total: prev.total + 1,
      cancelled: prev.cancelled + (row.action === "cancel" ? 1 : 0),
      sent: prev.sent + (confirmed ? 1 : 0),
      rebooked: prev.rebooked + (rebooked ? 1 : 0),
      unreachable:
        prev.unreachable + (isOnCallList({ action: row.action, deliveries, rebooked }) ? 1 : 0),
      refundFailed: prev.refundFailed + (row.refund === "failed" ? 1 : 0),
      refundFailures:
        row.refund === "failed"
          ? [...prev.refundFailures, refundFailureOf(row)]
          : prev.refundFailures,
      refundPending: prev.refundPending + (row.refund === "pending" ? 1 : 0),
    });
  }
  return [...byRule.values()];
}

/**
 * Sent / Rebooked / Unreachable and refund counts per closure, for the Special
 * dates tab. Keyed by the outcome's `dateRuleId`, so a reopened closure and an
 * ended (soft-deleted) Tonight close-early are still counted.
 */
export async function listSummaries(
  venueId: string,
  now: Date = new Date(),
  db: Db = prisma
): Promise<ClosureSummary[]> {
  const rows = await db.closureOutcome.findMany({
    where: { venueId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      dateRuleId: true,
      action: true,
      deliveries: true,
      rebookedReservationId: true,
      refund: true,
      refundCents: true,
      reservation: {
        select: {
          guestName: true,
          startTime: true,
          deposit: {
            select: {
              amountCents: true,
              currency: true,
              status: true,
              refundAmountCents: true,
              postCaptureRefundCents: true,
            },
          },
        },
      },
    },
  });
  // A reopen notice goes only to cancelled guests whose booking has not started
  // (`listNotifiable`), so that is the count the Reopen dialog may promise.
  const upcoming = new Map<string, number>();
  for (const row of rows) {
    if (row.action !== "cancel" || !row.reservation.startTime) continue;
    if (row.reservation.startTime.getTime() <= now.getTime()) continue;
    upcoming.set(row.dateRuleId, (upcoming.get(row.dateRuleId) ?? 0) + 1);
  }
  return summarizeOutcomes(rows).map((s) => ({
    ...s,
    upcomingCancelled: upcoming.get(s.ruleId) ?? 0,
  }));
}
