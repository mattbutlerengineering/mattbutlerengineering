import { type ConfirmHoldRequest, type Reservation, type VenueSettings } from "@mbe/types";
import { prisma } from "./database.js";
import { emitHoldConfirmed } from "./events.js";
import { availabilityService } from "./availability.js";
import { assertBookable } from "./assert-bookable.js";
import { bookSlot } from "./book-slot.js";
import { toReservation } from "./serializers.js";

type ConfirmHoldErrorCode =
  | "NOT_FOUND"
  | "EXPIRED"
  | "SESSION_MISMATCH"
  | "CONFLICT"
  | "PACING_EXCEEDED";

export interface ConfirmHoldInput {
  holdId: string;
  sessionId?: string;
  guestDetails: ConfirmHoldRequest;
  userId?: string;
}

export type ConfirmHoldResult =
  | { success: true; reservation: Reservation }
  | { success: false; error: string; errorCode: ConfirmHoldErrorCode };

/**
 * Orchestrates hold-to-reservation confirmation.
 *
 * Steps:
 * 1. Look up hold by ID
 * 2. If sessionId provided, validate it matches
 * 2.5. Pacing pre-check (fast fail outside the lock)
 * 3. bookSlot: advisory lock -> expiry guard -> conflict + pacing re-check ->
 *    create reservation -> delete hold
 * 4. Emit hold:confirmed event
 * 5. Return reservation
 *
 * The advisory lock, expiry guard, and conflict/pacing re-checks all run inside
 * the shared {@link bookSlot} seam so two concurrent confirmations (or a confirm
 * racing a walk-in create) on the same table serialize on the lock key and
 * cannot both pass their conflict checks and commit (write-skew double-booking).
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
    // CONFLICT from assertBookable is a pre-check only; bookSlot re-checks under
    // the advisory lock, which is the authoritative gate.
  }

  // Step 3: Atomic slot write under the advisory lock + transaction.
  const result = await bookSlot({
    tableId: hold.tableId,
    venueId: hold.venueId,
    date: hold.date,
    window: { startTime: hold.startTime, endTime: hold.endTime },
    partySize: hold.partySize,
    excludeHoldId: holdId,
    checkHoldConflict: true,
    checkPacing: hold.venueId != null,
    // Re-check expiry under the lock so an expired hold never produces a
    // reservation, even if it expired between the lookup and acquiring the lock.
    guard: async () =>
      hold.expiresAt < new Date() ? { code: "EXPIRED", message: "Hold has expired" } : undefined,
    // Every unbookable outcome (expired, conflict, pacing) consumes the hold.
    onUnbookable: async (tx) => {
      await tx.reservationHold.delete({ where: { id: holdId } });
    },
    write: async (tx) => {
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
        include: {
          table: true,
          guest: { select: { visitCount: true, communicationPreference: true } },
        },
      });

      // Delete the hold in the same transaction as the reservation insert.
      await tx.reservationHold.delete({ where: { id: holdId } });

      return reservation;
    },
  });

  if (!result.ok) {
    const { code } = result.conflict;
    if (code === "EXPIRED") {
      return { success: false, error: "Hold has expired", errorCode: "EXPIRED" };
    }
    if (code === "PACING_EXCEEDED") {
      return {
        success: false,
        error: "Pacing limit reached for this time slot",
        errorCode: "PACING_EXCEEDED",
      };
    }
    return { success: false, error: "Time slot is no longer available", errorCode: "CONFLICT" };
  }

  // Step 4: Map to domain type
  const reservation = toReservation(result.value);

  // Step 5: Emit event
  emitHoldConfirmed(reservation);

  return { success: true, reservation };
}
