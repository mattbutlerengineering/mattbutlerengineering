import {
  toDateString,
  type ReservationHold,
  type CreateHoldRequest,
  type VenueSettings,
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
    date: toDateString(hold.date),
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

export const holdService = {
  /**
   * Creates a hold on a time slot for a session.
   */
  async create(data: CreateHoldRequest, sessionId: string): Promise<CreateHoldResult> {
    const { venueId, date, time, partySize, tableId, holdDurationMinutes } = data;

    // Get venue settings for hold duration
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
    });

    if (!venue) {
      return { success: false, error: "Venue not found" };
    }

    const settings = venue.settings as VenueSettings | null;
    // Use request-provided duration, or fall back to venue setting, or default
    const holdDuration =
      holdDurationMinutes ?? settings?.holdDurationMinutes ?? DEFAULT_HOLD_DURATION;

    // Calculate times
    const startTime = new Date(time);
    const duration = availabilityService.estimateDuration(partySize, settings);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    const expiresAt = new Date(Date.now() + holdDuration * 60 * 1000);

    // Fetch reservations + holds once for both the conflict and pacing pre-checks.
    const { reservations, holds } = await availabilityService.fetchConflictData(venueId, date);

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
      const hasConflict = availabilityService.checkTableConflict(
        selectedTableId,
        startTime,
        endTime,
        reservations,
        holds
      );

      if (hasConflict) {
        return { success: false, error: "Table is not available for this time slot" };
      }
    }

    // Check pacing limits (pre-check)
    const pacingOk = availabilityService.checkPacingForSlot(
      startTime,
      partySize,
      settings,
      reservations,
      holds
    );

    if (!pacingOk) {
      const maxCovers = settings?.pacingRules?.[0]?.maxCoversPerSlot;
      return {
        success: false,
        error: `Pacing limit reached. Maximum ${maxCovers} covers per time window.`,
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
          AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
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
          AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
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
  async getBySessionId(sessionId: string, venueId: string): Promise<ReservationHold | null> {
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
