import type {
  ReservationHold,
  CreateHoldRequest,
  ConfirmHoldRequest,
  Reservation,
  Table,
  VenueSettings,
  TableShapeMetadata,
} from "@mbe/types";
import type { ReservationHold as PrismaHold } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { availabilityService } from "./availability.js";

// Default hold duration in minutes
const DEFAULT_HOLD_DURATION = 10;

function mapPrismaHold(hold: PrismaHold): ReservationHold {
  return {
    id: hold.id,
    venueId: hold.venueId,
    tableId: hold.tableId,
    date: hold.date.toISOString().split("T")[0],
    startTime: hold.startTime.toISOString(),
    endTime: hold.endTime.toISOString(),
    partySize: hold.partySize,
    sessionId: hold.sessionId,
    expiresAt: hold.expiresAt.toISOString(),
    createdAt: hold.createdAt.toISOString(),
  };
}

export interface CreateHoldResult {
  success: boolean;
  hold?: ReservationHold;
  error?: string;
}

export interface ConfirmHoldResult {
  success: boolean;
  reservation?: Reservation;
  error?: string;
}

export const holdService = {
  /**
   * Creates a hold on a time slot for a session.
   */
  async create(
    data: CreateHoldRequest,
    sessionId: string
  ): Promise<CreateHoldResult> {
    const { venueId, date, time, partySize, tableId } = data;

    // Get venue settings for hold duration
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
    });

    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const settings = venue.settings as VenueSettings | null;
    const holdDuration = settings?.holdDurationMinutes ?? DEFAULT_HOLD_DURATION;

    // Calculate times
    const startTime = new Date(time);
    const duration = availabilityService.estimateDuration(partySize, settings);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    const expiresAt = new Date(Date.now() + holdDuration * 60 * 1000);

    // Find or validate table (pre-check outside transaction for auto-assign)
    let selectedTableId = tableId;
    if (!selectedTableId) {
      // Auto-assign a table
      const table = await availabilityService.findBestTable(
        venueId,
        date,
        startTime,
        endTime,
        partySize
      );

      if (!table) {
        return { success: false, error: "No available tables for this time slot" };
      }
      selectedTableId = table.id;
    } else {
      // Pre-check: verify provided table is available
      const conflict = await availabilityService.checkConflict(
        selectedTableId!,
        date,
        startTime,
        endTime
      );

      if (conflict.hasConflict) {
        return { success: false, error: "Table is not available for this time slot" };
      }
    }

    // Check pacing limits (pre-check)
    const pacingCheck = await availabilityService.checkPacing(
      venueId,
      startTime,
      partySize,
      settings
    );

    if (!pacingCheck.withinLimit) {
      return {
        success: false,
        error: `Pacing limit reached. Maximum ${pacingCheck.maxCovers} covers per time window.`,
      };
    }

    // Wrap conflict re-check + hold creation in a transaction to prevent
    // concurrent requests from both passing the check
    const txResult = await prisma.$transaction(async (tx) => {
      // Re-check for conflicting reservations inside the transaction
      const conflictingReservation = await tx.reservation.findFirst({
        where: {
          tableId: selectedTableId,
          date: new Date(date),
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gt: startTime } },
          ],
        },
        select: { id: true },
      });

      if (conflictingReservation) {
        return { conflict: true as const };
      }

      // Re-check for conflicting holds inside the transaction
      const conflictingHold = await tx.reservationHold.findFirst({
        where: {
          tableId: selectedTableId,
          date: new Date(date),
          expiresAt: { gt: new Date() },
          sessionId: { not: sessionId }, // Don't conflict with own session
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gt: startTime } },
          ],
        },
        select: { id: true },
      });

      if (conflictingHold) {
        return { conflict: true as const };
      }

      // Release any existing holds for this session at this venue
      await tx.reservationHold.deleteMany({
        where: { sessionId, venueId },
      });

      // Create the hold
      const hold = await tx.reservationHold.create({
        data: {
          venueId,
          tableId: selectedTableId,
          date: new Date(date),
          startTime,
          endTime,
          partySize,
          sessionId,
          expiresAt,
        },
      });

      return { conflict: false as const, hold };
    });

    if (txResult.conflict) {
      return { success: false, error: "Table is not available for this time slot" };
    }

    return { success: true, hold: mapPrismaHold(txResult.hold) };
  },

  /**
   * Gets a hold by ID.
   */
  async getById(id: string): Promise<ReservationHold | null> {
    const hold = await prisma.reservationHold.findUnique({
      where: { id },
    });

    if (!hold) return null;

    // Check if expired
    if (hold.expiresAt < new Date()) {
      // Clean up expired hold
      await prisma.reservationHold.delete({ where: { id } });
      return null;
    }

    return mapPrismaHold(hold);
  },

  /**
   * Gets a hold by session ID for a venue.
   */
  async getBySessionId(
    sessionId: string,
    venueId: string
  ): Promise<ReservationHold | null> {
    const hold = await prisma.reservationHold.findFirst({
      where: {
        sessionId,
        venueId,
        expiresAt: { gt: new Date() },
      },
    });

    return hold ? mapPrismaHold(hold) : null;
  },

  /**
   * Releases a hold.
   */
  async release(id: string, sessionId: string): Promise<boolean> {
    try {
      const result = await prisma.reservationHold.deleteMany({
        where: { id, sessionId },
      });
      return result.count > 0;
    } catch {
      return false;
    }
  },

  /**
   * Converts a hold to a reservation.
   */
  async convertToReservation(
    holdId: string,
    sessionId: string,
    guestDetails: ConfirmHoldRequest,
    userId?: string
  ): Promise<ConfirmHoldResult> {
    // Look up the hold by ID first, then diagnose failure separately
    const hold = await prisma.reservationHold.findUnique({
      where: { id: holdId },
    });

    if (!hold) {
      return { success: false, error: "Hold not found" };
    }

    if (hold.expiresAt < new Date()) {
      // Clean up the expired hold
      await prisma.reservationHold.delete({ where: { id: holdId } }).catch(() => {});
      return { success: false, error: "Hold has expired" };
    }

    if (hold.sessionId !== sessionId) {
      return { success: false, error: "Session ID does not match the hold" };
    }

    // Check conflict + create reservation + delete hold atomically in a transaction
    // to prevent TOCTOU race conditions where two simultaneous conversions both
    // pass the conflict check and create overlapping reservations.
    const txResult = await prisma.$transaction(async (tx) => {
      // Verify the table is still available (inside transaction for atomicity)
      const conflictingReservation = await tx.reservation.findFirst({
        where: {
          tableId: hold.tableId,
          date: hold.date,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          AND: [
            { startTime: { lt: hold.endTime } },
            { endTime: { gt: hold.startTime } },
          ],
        },
        select: { id: true },
      });

      if (conflictingReservation) {
        // Clean up the hold since it's no longer valid
        await tx.reservationHold.delete({ where: { id: holdId } });
        return { conflict: true as const };
      }

      const conflictingHold = await tx.reservationHold.findFirst({
        where: {
          tableId: hold.tableId,
          date: hold.date,
          expiresAt: { gt: new Date() },
          id: { not: holdId },
          AND: [
            { startTime: { lt: hold.endTime } },
            { endTime: { gt: hold.startTime } },
          ],
        },
        select: { id: true },
      });

      if (conflictingHold) {
        // Clean up the hold since it's no longer valid
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
      return { success: false, error: "Time slot is no longer available" };
    }

    const result = txResult.reservation;
    return {
      success: true,
      reservation: {
        id: result.id,
        date: result.date.toISOString().split("T")[0],
        startTime: result.startTime.toISOString(),
        endTime: result.endTime.toISOString(),
        partySize: result.partySize,
        status: result.status,
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
      },
    };
  },

  /**
   * Cleans up expired holds.
   * Called opportunistically on ~1% of requests.
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.reservationHold.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  },

  /**
   * Should be called to opportunistically clean up expired holds.
   * Returns true if cleanup was performed.
   */
  async maybeCleanup(): Promise<boolean> {
    // 1% chance of cleanup
    if (Math.random() > 0.01) {
      return false;
    }

    await this.cleanupExpired();
    return true;
  },
};
