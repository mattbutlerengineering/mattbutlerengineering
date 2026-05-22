import {
  toDateString,
  type ConfirmHoldRequest,
  type Reservation,
  type ReservationStatus,
  type Table,
  type TableShapeMetadata,
} from "@mbe/types";
import { prisma } from "./database.js";
import { emitHoldConfirmed } from "./events.js";

type ConfirmHoldErrorCode = "NOT_FOUND" | "EXPIRED" | "SESSION_MISMATCH" | "CONFLICT";

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
 * 2. Check expiry (+ cleanup expired hold)
 * 3. If sessionId provided, validate it matches
 * 4. Transaction: conflict check -> create reservation -> delete hold
 * 5. Emit hold:confirmed event
 * 6. Return reservation
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

  // Step 2: Check expiry
  if (hold.expiresAt < new Date()) {
    await prisma.reservationHold.delete({ where: { id: holdId } }).catch(() => {});
    return { success: false, error: "Hold has expired", errorCode: "EXPIRED" };
  }

  // Step 3: Session validation (only when sessionId is provided — internal path)
  if (sessionId !== undefined && hold.sessionId !== sessionId) {
    return {
      success: false,
      error: "Session ID does not match the hold",
      errorCode: "SESSION_MISMATCH",
    };
  }

  // Step 4: Transaction — conflict check + create reservation + delete hold
  const txResult = await prisma.$transaction(async (tx: PrismaTransactionClient) => {
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
      return { conflict: true as const };
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
      return { conflict: true as const };
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

    return { conflict: false as const, reservation };
  });

  if (txResult.conflict) {
    return {
      success: false,
      error: "Time slot is no longer available",
      errorCode: "CONFLICT",
    };
  }

  // Step 5: Map to domain type
  const reservation = mapReservationResult(txResult.reservation);

  // Step 6: Emit event
  emitHoldConfirmed(reservation);

  return { success: true, reservation };
}

// Transaction client type — matches the subset used in the transaction callback
type PrismaTransactionClient = {
  reservation: {
    findFirst: typeof prisma.reservation.findFirst;
    create: typeof prisma.reservation.create;
  };
  reservationHold: {
    findFirst: typeof prisma.reservationHold.findFirst;
    delete: typeof prisma.reservationHold.delete;
  };
};
