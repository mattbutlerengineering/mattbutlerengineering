import { toDateString } from "@mbe/types";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import {
  overlapWindow,
  serviceDayConflictWindow,
  activeHoldWindow,
  NOT_BOOKED_STATUSES,
} from "./slot-rules.js";
import { setVenueContext } from "../middleware/venue-context.js";
import type { BookingChannel, SoftLimit } from "@mbe/availability";
import { judgeBooking, type GateRejection } from "./assert-bookable.js";

/**
 * Builds a transaction-scoped advisory lock statement keyed on the table id.
 *
 * Serializes every conflict-checked write for a given table so that concurrent
 * slot writes (a confirm racing a walk-in, two staff bookings, a hold racing a
 * confirm) cannot both pass their conflict checks under read-committed
 * isolation and both commit (write-skew double-booking). `hashtext` maps the
 * table id to an int4 which is cast to bigint for the single-key
 * `pg_advisory_xact_lock` overload.
 *
 * The table id is bound as a parameter (never string-interpolated) to prevent
 * SQL injection. The lock auto-releases when the transaction commits or rolls
 * back.
 */
export function tableAdvisoryLockSql(tableId: string): Prisma.Sql {
  return Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${tableId})::bigint)`;
}

/**
 * Share-locks the venue row for the rest of the transaction, before the gate reads config.
 *
 * A closure or config save compare-and-sets (`UPDATE`) that row, then scans bookings. Sharing it
 * makes an in-flight booking and that save serialise: either the save waits for this commit and
 * its scan sees the booking, or this waits for the save and the gate reads the new config.
 *
 * Lock order is venue row -> table advisory lock, so call it BEFORE `tableAdvisoryLockSql`. The
 * closure command CASes the venue row and then, moving a booking, takes the table advisory lock
 * (`closure-apply.ts` `targetTaken`); the same order on both sides cannot form a cycle. Share locks
 * do not conflict with each other, so bookings never block one another here (#7679).
 */
function venueShareLockSql(venueId: string): Prisma.Sql {
  return Prisma.sql`SELECT 1 FROM venues WHERE id = ${venueId} FOR SHARE`;
}

/** Why a slot could not be written. */
export type SlotConflictCode = "CONFLICT" | "EXPIRED" | "NOT_BOOKABLE";

/** `NOT_BOOKABLE` is the availability gate's refusal and carries its {@link GateRejection}. */
export type SlotConflict =
  | { code: Exclude<SlotConflictCode, "NOT_BOOKABLE">; message: string }
  | { code: "NOT_BOOKABLE"; message: string; rejection: GateRejection };

/**
 * Outcome of a {@link bookSlot} call: the value produced by the caller's write
 * on success, or the structured reason the slot could not be written.
 */
export type SlotWriteResult<T> = { ok: true; value: T } | { ok: false; conflict: SlotConflict };

export interface BookSlotIntent<T> {
  /** Table whose slot is written; keys the advisory lock and conflict re-check. */
  tableId: string;
  /** Venue the availability gate judges; null/undefined skips the gate. */
  venueId?: string | null;
  /** Date-only used by the in-transaction conflict queries. */
  date: Date;
  /** Slot window — [startTime, endTime). */
  window: { startTime: Date; endTime: Date };
  /** Party size being booked. */
  partySize: number;
  /** Reservation excluded from the conflict re-check (moving an existing reservation). */
  excludeReservationId?: string;
  /** Hold excluded from the conflict re-check (confirming that hold). */
  excludeHoldId?: string;
  /** Session whose holds are excluded from the re-check (own session's holds during hold-create). */
  excludeSessionId?: string;
  /** Also re-check conflicting holds (not just reservations). */
  checkHoldConflict?: boolean;
  /**
   * Judge the slot against the venue's resolved availability under the lock,
   * reading the committed configuration through this transaction
   * ({@link judgeBooking}). Requires venueId. Walk-ins never set it.
   */
  gate?: { channel: BookingChannel; override?: { reason: string }; movingFrom?: Date };
  /**
   * Runs immediately after the lock, before the conflict re-check. Returning a
   * {@link SlotConflict} short-circuits the write (e.g. a hold that expired
   * between lookup and acquiring the lock).
   */
  guard?: (tx: Prisma.TransactionClient) => Promise<SlotConflict | undefined>;
  /**
   * Runs inside the transaction whenever the slot is unbookable (guard,
   * conflict, or gate refusal), before {@link bookSlot} returns — e.g. deleting the
   * hold that could not be confirmed.
   */
  onUnbookable?: (tx: Prisma.TransactionClient, conflict: SlotConflict) => Promise<void>;
  /**
   * Performs the actual mutation once the slot is confirmed bookable.
   * `gated.overrideLimits` lists the soft limits a staff override passed, so
   * the write can store them with the booking.
   */
  write: (tx: Prisma.TransactionClient, gated: { overrideLimits?: SoftLimit[] }) => Promise<T>;
}

/**
 * The one canonical "write a Reservation (or Hold) into a Table slot" seam.
 *
 * Every slot write in the service routes through here so the double-booking
 * invariant lives in exactly one place and cannot be silently dropped by a
 * call site. Under a per-table advisory lock inside a single transaction it:
 *
 *   1. acquires the advisory lock (serializes writes for this table),
 *   2. runs the optional caller guard (e.g. hold-expiry),
 *   3. re-checks conflicting reservations (and holds, when requested),
 *   4. judges the availability gate (when requested; pacing, closures),
 *   5. runs the caller's write, returning its value.
 *
 * The lock + re-check together close the read-committed write-skew window: two
 * concurrent bookings of the same slot serialize on the lock key, and the
 * second sees the first's committed row and is rejected. SSE emission stays
 * with the caller (route handlers own emission for most paths).
 */
export async function bookSlot<T>(intent: BookSlotIntent<T>): Promise<SlotWriteResult<T>> {
  const {
    tableId,
    venueId,
    date,
    window: { startTime, endTime },
    excludeReservationId,
    excludeHoldId,
    excludeSessionId,
    checkHoldConflict = false,
    gate,
    guard,
    onUnbookable,
    write,
  } = intent;
  const serviceDays = serviceDayConflictWindow(date);

  return prisma.$transaction(async (tx): Promise<SlotWriteResult<T>> => {
    // This `prisma.$transaction` call bypasses the per-call auto-wrap
    // `services/venue-scoped-prisma.ts` gives the `prisma` export — set
    // app.venue_id on THIS transaction's own `tx` explicitly (ADR-026 part
    // 6), using the intent's own (already-resolved) venueId.
    await setVenueContext(tx, venueId);

    // Gated writes take the venue row first (share), the order the closure command uses
    // (venue row, then table locks), so the two can never wait on each other in a cycle.
    if (gate && venueId) await tx.$executeRaw(venueShareLockSql(venueId));

    // Serialize conflict-checked writes per table BEFORE any conflict check so
    // concurrent slot writes cannot both pass and double-book. Released
    // automatically when the transaction ends.
    await tx.$executeRaw(tableAdvisoryLockSql(tableId));

    const fail = async (conflict: SlotConflict): Promise<SlotWriteResult<T>> => {
      if (onUnbookable) await onUnbookable(tx, conflict);
      return { ok: false, conflict };
    };

    if (guard) {
      const guardConflict = await guard(tx);
      if (guardConflict) return fail(guardConflict);
    }

    const conflictingReservation = await tx.reservation.findFirst({
      where: {
        tableId,
        date: serviceDays,
        status: { notIn: [...NOT_BOOKED_STATUSES] },
        ...overlapWindow(startTime, endTime),
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      select: { id: true },
    });
    if (conflictingReservation) {
      return fail({ code: "CONFLICT", message: "Table is not available for this time slot" });
    }

    if (checkHoldConflict) {
      const conflictingHold = await tx.reservationHold.findFirst({
        where: {
          tableId,
          date: serviceDays,
          expiresAt: activeHoldWindow(new Date()),
          ...overlapWindow(startTime, endTime),
          ...(excludeHoldId ? { id: { not: excludeHoldId } } : {}),
          ...(excludeSessionId ? { sessionId: { not: excludeSessionId } } : {}),
        },
        select: { id: true },
      });
      if (conflictingHold) {
        return fail({ code: "CONFLICT", message: "Table is not available for this time slot" });
      }
    }

    let gated: { overrideLimits?: SoftLimit[] } = {};
    if (gate && venueId) {
      const verdict = await availabilityVerdict(tx, { ...intent, venueId }, gate);
      if (verdict.conflict) return fail(verdict.conflict);
      gated = { overrideLimits: verdict.overrideLimits };
    }

    const value = await write(tx, gated);
    return { ok: true, value };
  });
}

const GATE_MESSAGE = "Requested time is outside the venue's availability";

/** The availability gate's verdict on this intent's slot: a {@link SlotConflict}, or the limits a staff override passed. */
async function availabilityVerdict(
  tx: Prisma.TransactionClient,
  intent: BookSlotIntent<unknown> & { venueId: string },
  gate: NonNullable<BookSlotIntent<unknown>["gate"]>
): Promise<{ conflict?: SlotConflict; overrideLimits?: SoftLimit[] }> {
  const outcome = await judgeBooking(tx, {
    venueId: intent.venueId,
    tableId: intent.tableId,
    start: intent.window.startTime,
    serviceDate: Number.isNaN(intent.date.getTime()) ? "invalid" : toDateString(intent.date),
    end: intent.window.endTime,
    partySize: intent.partySize,
    channel: gate.channel,
    override: gate.override,
    movingFrom: gate.movingFrom,
    excludeReservationId: intent.excludeReservationId,
    excludeHoldId: intent.excludeHoldId,
    excludeSessionId: intent.excludeSessionId,
  });
  if (outcome.kind === "conflict") {
    return { conflict: { code: "CONFLICT", message: "Table is not available for this time slot" } };
  }
  if (outcome.kind === "rejected") {
    return {
      conflict: { code: "NOT_BOOKABLE", message: GATE_MESSAGE, rejection: outcome.rejection },
    };
  }
  return { overrideLimits: outcome.overrideLimits };
}
