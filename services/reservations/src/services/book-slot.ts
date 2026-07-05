import type { VenueSettings } from "@mbe/types";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { checkPacingForSlot } from "./slot-rules.js";

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

/** Why a slot could not be written. */
export type SlotConflictCode = "CONFLICT" | "PACING_EXCEEDED" | "EXPIRED";

export interface SlotConflict {
  code: SlotConflictCode;
  message: string;
}

/**
 * Outcome of a {@link bookSlot} call: the value produced by the caller's write
 * on success, or the structured reason the slot could not be written.
 */
export type SlotWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; conflict: SlotConflict };

export interface BookSlotIntent<T> {
  /** Table whose slot is written; keys the advisory lock and conflict re-check. */
  tableId: string;
  /** Venue for the pacing re-check; null/undefined skips pacing. */
  venueId?: string | null;
  /** Date-only used by the in-transaction conflict/pacing queries. */
  date: Date;
  /** Slot window — [startTime, endTime). */
  window: { startTime: Date; endTime: Date };
  /** Party size added when computing the pacing re-check. */
  partySize: number;
  /** Reservation excluded from the conflict re-check (moving an existing reservation). */
  excludeReservationId?: string;
  /** Hold excluded from the conflict/pacing re-check (confirming that hold). */
  excludeHoldId?: string;
  /** Session whose holds are excluded from the re-check (own session's holds during hold-create). */
  excludeSessionId?: string;
  /** Also re-check conflicting holds (not just reservations). */
  checkHoldConflict?: boolean;
  /** Re-check pacing under the lock. Requires venueId. */
  checkPacing?: boolean;
  /**
   * Runs immediately after the lock, before the conflict re-check. Returning a
   * {@link SlotConflict} short-circuits the write (e.g. a hold that expired
   * between lookup and acquiring the lock).
   */
  guard?: (tx: Prisma.TransactionClient) => Promise<SlotConflict | undefined>;
  /**
   * Runs inside the transaction whenever the slot is unbookable (guard,
   * conflict, or pacing), before {@link bookSlot} returns — e.g. deleting the
   * hold that could not be confirmed.
   */
  onUnbookable?: (tx: Prisma.TransactionClient, conflict: SlotConflict) => Promise<void>;
  /** Performs the actual mutation once the slot is confirmed bookable. */
  write: (tx: Prisma.TransactionClient) => Promise<T>;
}

const NOT_BOOKED_STATUSES: Prisma.ReservationWhereInput["status"] = {
  notIn: ["CANCELLED", "NO_SHOW"],
};

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
 *   4. re-checks pacing (when requested),
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
    partySize,
    excludeReservationId,
    excludeHoldId,
    excludeSessionId,
    checkHoldConflict = false,
    checkPacing = false,
    guard,
    onUnbookable,
    write,
  } = intent;

  return prisma.$transaction(async (tx): Promise<SlotWriteResult<T>> => {
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
        date,
        status: NOT_BOOKED_STATUSES,
        AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
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
          date,
          expiresAt: { gt: new Date() },
          AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
          ...(excludeHoldId ? { id: { not: excludeHoldId } } : {}),
          ...(excludeSessionId ? { sessionId: { not: excludeSessionId } } : {}),
        },
        select: { id: true },
      });
      if (conflictingHold) {
        return fail({ code: "CONFLICT", message: "Table is not available for this time slot" });
      }
    }

    if (checkPacing && venueId) {
      const now = new Date();
      const reservations = await tx.reservation.findMany({
        where: { venueId, date, status: NOT_BOOKED_STATUSES },
        select: { id: true, tableId: true, startTime: true, endTime: true, partySize: true },
      });
      const holds = await tx.reservationHold.findMany({
        where: {
          venueId,
          date,
          expiresAt: { gt: now },
          ...(excludeHoldId ? { id: { not: excludeHoldId } } : {}),
          ...(excludeSessionId ? { sessionId: { not: excludeSessionId } } : {}),
        },
        select: {
          id: true,
          tableId: true,
          startTime: true,
          endTime: true,
          partySize: true,
          expiresAt: true,
        },
      });
      const settings = (
        await tx.venue.findUnique({ where: { id: venueId }, select: { settings: true } })
      )?.settings as VenueSettings | null | undefined;

      const pacingOk = checkPacingForSlot(startTime, partySize, settings, reservations, holds);
      if (!pacingOk) {
        return fail({
          code: "PACING_EXCEEDED",
          message: "Pacing limit reached for this time slot",
        });
      }
    }

    const value = await write(tx);
    return { ok: true, value };
  });
}
