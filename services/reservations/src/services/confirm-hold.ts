import {
  toDateString,
  type ConfirmHoldRequest,
  type Reservation,
  type ReservationStatus,
  type Table,
  type TableShapeMetadata,
  type VenueSettings,
} from "@mbe/types";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { emitHoldConfirmed } from "./events.js";
import { availabilityService, checkPacingForSlot } from "./availability.js";
import { assertBookable } from "./assert-bookable.js";

type ConfirmHoldErrorCode =
  | "NOT_FOUND"
  | "EXPIRED"
  | "SESSION_MISMATCH"
  | "CONFLICT"
  | "PACING_EXCEEDED";

/**
 * Builds a transaction-scoped advisory lock statement keyed on the table id.
 *
 * Serializes every conflict-checked write for a given table so that concurrent
 * confirmations (or a confirm racing a walk-in create) cannot both pass their
 * conflict checks under read-committed isolation and both commit a reservation
 * (write-skew double-booking). `hashtext` maps the table id to an int4 which is
 * cast to bigint for the single-key `pg_advisory_xact_lock` overload.
 *
 * The table id is bound as a parameter (never string-interpolated) to prevent
 * SQL injection. The lock auto-releases when the transaction commits or rolls
 * back.
 */
export function tableAdvisoryLockSql(tableId: string): Prisma.Sql {
  return Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${tableId})::bigint)`;
}

export interface ConfirmHoldInput {
  holdId: string;
  sessionId?: string;
  guestDetails: ConfirmHoldRequest;
  userId?: string;
}

export type ConfirmHoldResult =
  | { success: true; reservation: Reservation }
  | { success: false; error: string; errorCode: ConfirmHoldErrorCode };

function mapReservationResult(result: {
  id: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  partySize: number;
  status: string;
  notes: string | null;
  cancellationReason: string | null;
  cancellationNote: string | null;
  occasion: string | null;
  seatingPreference: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestId: string | null;
  userId: string | null;
  tableId: string;
  table?: {
    id: string;
    name: string;
    tableNumber: string | null;
    capacity: number;
    minCovers: number;
    maxCovers: number | null;
    location: string | null;
    isActive: boolean;
    priority: number;
    status: string;
    venueId: string | null;
    floorPlanId: string | null;
    shapeMetadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  venueId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Reservation {
  return {
    id: result.id,
    date: toDateString(result.date),
    startTime: result.startTime.toISOString(),
    endTime: result.endTime.toISOString(),
    partySize: result.partySize,
    status: result.status as ReservationStatus,
    notes: result.notes,
    cancellationReason: result.cancellationReason,
    cancellationNote: result.cancellationNote,
    occasion: result.occasion as Reservation["occasion"],
    seatingPreference: result.seatingPreference as Reservation["seatingPreference"],
    guestName: result.guestName,
    guestEmail: result.guestEmail,
    guestPhone: result.guestPhone,
    guestId: result.guestId,
    userId: result.userId,
    tableId: result.tableId,
    table: result.table
      ? {
          id: result.table.id,
          name: result.table.name,
          tableNumber: result.table.tableNumber,
          capacity: result.table.capacity,
          minCovers: result.table.minCovers,
          maxCovers: result.table.maxCovers,
          location: result.table.location,
          isActive: result.table.isActive,
          priority: result.table.priority,
          status: result.table.status as Table["status"],
          venueId: result.table.venueId,
          floorPlanId: result.table.floorPlanId,
          shapeMetadata: result.table.shapeMetadata as TableShapeMetadata | null,
          createdAt: result.table.createdAt.toISOString(),
          updatedAt: result.table.updatedAt.toISOString(),
        }
      : undefined,
    venueId: result.venueId,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

/**
 * Orchestrates hold-to-reservation confirmation.
 *
 * Steps:
 * 1. Look up hold by ID
 * 2. If sessionId provided, validate it matches
 * 3. Transaction: advisory lock -> expiry check -> conflict check -> create
 *    reservation -> delete hold
 * 4. Emit hold:confirmed event
 * 5. Return reservation
 *
 * The advisory lock and expiry check live inside the transaction so two
 * concurrent confirmations (or a confirm racing a walk-in create) on the same
 * table serialize on the lock key and cannot both pass their conflict checks
 * and commit (write-skew double-booking).
 */
export async function confirmHold(input: ConfirmHoldInput): Promise<ConfirmHoldResult> {
  const { holdId, sessionId, guestDetails, userId } = input;

  // Step 1: Look up hold
  const hold = await prisma.reservationHold.findUnique({
    where: { id: holdId },
  });

  if (!hold) {
    return { success: false, error: "Hold not found", errorCode: "NOT_FOUND" };
  }

  // Step 2: Session validation (only when sessionId is provided — internal path)
  if (sessionId !== undefined && hold.sessionId !== sessionId) {
    return {
      success: false,
      error: "Session ID does not match the hold",
      errorCode: "SESSION_MISMATCH",
    };
  }

  // Step 2.5: Pacing pre-check — runs outside the transaction so pacing is
  // enforced on every confirm path, not just hold create. Fetch venue settings
  // and conflict slices once; pass to assertBookable (pure rule, no DB access).
  if (hold.venueId) {
    const venue = await prisma.venue.findUnique({ where: { id: hold.venueId } });
    const settings = (venue?.settings ?? null) as VenueSettings | null;
    const dateStr = hold.date.toISOString().slice(0, 10);
    const { reservations, holds: holdSlices } = await availabilityService.fetchConflictData(
      hold.venueId,
      dateStr
    );

    const bookingError = assertBookable({
      tableId: hold.tableId,
      window: { startTime: hold.startTime, endTime: hold.endTime },
      partySize: hold.partySize,
      settings,
      reservations,
      holds: holdSlices,
      excludeHoldId: holdId,
    });

    if (bookingError?.code === "PACING_EXCEEDED") {
      return { success: false, error: bookingError.message, errorCode: "PACING_EXCEEDED" };
    }
    // CONFLICT from assertBookable is a pre-check only; the transaction re-checks
    // under the advisory lock, which is the authoritative gate.
  }

  // Step 3: Transaction — advisory lock + expiry check + conflict check +
  // create reservation + delete hold
  const txResult = await prisma.$transaction(async (tx: PrismaTransactionClient) => {
    // Serialize conflict-checked writes per table BEFORE any conflict check so
    // concurrent confirmations cannot both pass and double-book. The lock is
    // released automatically when the transaction ends.
    await tx.$executeRaw(tableAdvisoryLockSql(hold.tableId));

    // Re-check expiry inside the transaction so an expired hold never produces a
    // reservation, even if it expired between the lookup and acquiring the lock.
    if (hold.expiresAt < new Date()) {
      await tx.reservationHold.delete({ where: { id: holdId } });
      return { outcome: "expired" as const };
    }

    // Check for conflicting reservations
    const conflictingReservation = await tx.reservation.findFirst({
      where: {
        tableId: hold.tableId,
        date: hold.date,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        AND: [{ startTime: { lt: hold.endTime } }, { endTime: { gt: hold.startTime } }],
      },
      select: { id: true },
    });

    if (conflictingReservation) {
      await tx.reservationHold.delete({ where: { id: holdId } });
      return { outcome: "conflict" as const };
    }

    // Check for conflicting holds
    const conflictingHold = await tx.reservationHold.findFirst({
      where: {
        tableId: hold.tableId,
        date: hold.date,
        expiresAt: { gt: new Date() },
        id: { not: holdId },
        AND: [{ startTime: { lt: hold.endTime } }, { endTime: { gt: hold.startTime } }],
      },
      select: { id: true },
    });

    if (conflictingHold) {
      await tx.reservationHold.delete({ where: { id: holdId } });
      return { outcome: "conflict" as const };
    }

    // Re-check pacing under the advisory lock so two concurrent confirmations
    // at the same slot (on different tables) cannot both pass the pre-lock
    // pacing check and jointly exceed the cover limit (TOCTOU close).
    if (hold.venueId) {
      const txReservations = await tx.reservation.findMany({
        where: {
          venueId: hold.venueId,
          date: hold.date,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
        },
        select: { id: true, tableId: true, startTime: true, endTime: true, partySize: true },
      });
      const txHolds = await tx.reservationHold.findMany({
        where: {
          venueId: hold.venueId,
          date: hold.date,
          expiresAt: { gt: new Date() },
          id: { not: holdId },
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
        await tx.venue.findUnique({ where: { id: hold.venueId }, select: { settings: true } })
      )?.settings as VenueSettings | null | undefined;

      const pacingOk = checkPacingForSlot(
        hold.startTime,
        hold.partySize,
        settings,
        txReservations,
        txHolds
      );

      if (!pacingOk) {
        await tx.reservationHold.delete({ where: { id: holdId } });
        return { outcome: "pacing_exceeded" as const };
      }
    }

    // Create the reservation
    const reservation = await tx.reservation.create({
      data: {
        date: hold.date,
        startTime: hold.startTime,
        endTime: hold.endTime,
        partySize: hold.partySize,
        tableId: hold.tableId,
        venueId: hold.venueId,
        guestName: guestDetails.guestName ?? null,
        guestEmail: guestDetails.guestEmail ?? null,
        guestPhone: guestDetails.guestPhone ?? null,
        guestId: guestDetails.guestId ?? null,
        notes: guestDetails.notes ?? null,
        userId: userId ?? null,
        status: "CONFIRMED",
      },
      include: { table: true },
    });

    // Delete the hold
    await tx.reservationHold.delete({ where: { id: holdId } });

    return { outcome: "created" as const, reservation };
  });

  if (txResult.outcome === "expired") {
    return { success: false, error: "Hold has expired", errorCode: "EXPIRED" };
  }

  if (txResult.outcome === "conflict") {
    return {
      success: false,
      error: "Time slot is no longer available",
      errorCode: "CONFLICT",
    };
  }

  if (txResult.outcome === "pacing_exceeded") {
    return {
      success: false,
      error: "Pacing limit reached for this time slot",
      errorCode: "PACING_EXCEEDED",
    };
  }

  // Step 4: Map to domain type
  const reservation = mapReservationResult(txResult.reservation);

  // Step 5: Emit event
  emitHoldConfirmed(reservation);

  return { success: true, reservation };
}

// Transaction client type — matches the subset used in the transaction callback
type PrismaTransactionClient = {
  $executeRaw: typeof prisma.$executeRaw;
  venue: {
    findUnique: typeof prisma.venue.findUnique;
  };
  reservation: {
    findFirst: typeof prisma.reservation.findFirst;
    findMany: typeof prisma.reservation.findMany;
    create: typeof prisma.reservation.create;
  };
  reservationHold: {
    findFirst: typeof prisma.reservationHold.findFirst;
    findMany: typeof prisma.reservationHold.findMany;
    delete: typeof prisma.reservationHold.delete;
  };
};
