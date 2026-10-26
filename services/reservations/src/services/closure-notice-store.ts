import { addDays, rebookOffers } from "@mbe/availability";
import type { PrismaClient } from "../generated/prisma/index.js";
import { loadAvailabilitySnapshot } from "./availability-snapshot.js";
import { civilDateIn } from "./availability-migration.js";
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
  /** Minute of the service day the window opens; `null` = the whole service day. */
  from: number | null;
  timezone: string;
}

function windowFrom(window: unknown): number | null {
  const from = (window as { from?: unknown } | null)?.from;
  return typeof from === "number" ? from : null;
}

/** The closure's start, for the per-closure urgency decision. A reopened rule is still read. */
export async function loadClosureWindow(
  venueId: string,
  ruleId: string,
  db: RuleDb = prisma
): Promise<ClosureWindow | null> {
  const rule = await db.dateRule.findFirst({
    where: { id: ruleId, venueId },
    select: { startsOn: true, window: true, venue: { select: { ianaTimezone: true } } },
  });
  if (!rule) return null;
  return {
    startsOn: rule.startsOn.toISOString().slice(0, 10),
    from: windowFrom(rule.window),
    timezone: rule.venue.ianaTimezone,
  };
}

export interface NotifiableOutcome {
  outcomeId: string;
}

export type NoticeVariant = "closure" | "reopened";

/** Who a closure notice goes to; a reopen notice goes only to cancelled guests. */
export async function listNotifiable(
  venueId: string,
  ruleId: string,
  variant: NoticeVariant,
  db: Db = prisma
): Promise<NotifiableOutcome[]> {
  const rows = await db.closureOutcome.findMany({
    where: {
      venueId,
      dateRuleId: ruleId,
      action: variant === "reopened" ? "cancel" : { not: "keep_silent" },
    },
    select: { id: true },
  });
  return rows.map((r) => ({ outcomeId: r.id }));
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
          deposit: { select: { amountCents: true, currency: true } },
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
    refund: r.deposit ? { amountCents: r.deposit.amountCents, currency: r.deposit.currency } : null,
    venueName: row.venue.name,
    timezone: row.venue.ianaTimezone,
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

/**
 * What a closure refund still owes: the deposit less its own partial refund and anything
 * refunded after capture, as `closure-refund.ts` computes it before calling Stripe.
 */
function refundOwedCents(deposit: NonNullable<SummaryRow["reservation"]["deposit"]>): number {
  const ownLeg = deposit.status === "partial_refunded" ? (deposit.refundAmountCents ?? 0) : 0;
  return Math.max(0, deposit.amountCents - ownLeg - (deposit.postCaptureRefundCents ?? 0));
}

function refundFailureOf(row: SummaryRow): RefundFailure {
  const { guestName, deposit } = row.reservation;
  return {
    outcomeId: row.id,
    guestName,
    amountCents: deposit ? refundOwedCents(deposit) : null,
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
export async function listSummaries(venueId: string, db: Db = prisma): Promise<ClosureSummary[]> {
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
      reservation: {
        select: {
          guestName: true,
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
  return summarizeOutcomes(rows);
}
