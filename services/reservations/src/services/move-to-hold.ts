import type { Reservation } from "@mbe/types";
import { prisma } from "./database.js";
import { bookSlot } from "./book-slot.js";
import { toReservation } from "./serializers.js";
import {
  SYSTEM_ACTOR,
  recordReservationEvent,
  toEventState,
  type ReservationEventActor,
} from "./reservation-events.js";

type MoveToHoldErrorCode =
  "NOT_FOUND" | "EXPIRED" | "SESSION_MISMATCH" | "CONFLICT" | "PACING_EXCEEDED";

export interface MoveToHoldInput {
  /** The existing reservation to move. Its status is never changed. */
  reservation: Reservation;
  holdId: string;
  /** Session that owns the hold; must match. */
  sessionId: string;
  /**
   * Venue the caller is scoped to. A hold from another venue is reported as
   * `NOT_FOUND`, never as a distinct error, so its existence does not leak.
   */
  venueId: string;
  /** Written in the same transaction as the move when provided. */
  notes?: string;
  /** Who moved it; recorded on the `moved` event. Defaults to {@link SYSTEM_ACTOR}. */
  actor?: ReservationEventActor;
}

export type MoveToHoldResult =
  | { success: true; reservation: Reservation }
  | { success: false; error: string; errorCode: MoveToHoldErrorCode };

/**
 * Atomically moves an existing reservation onto a guest's hold.
 *
 * The move runs through {@link bookSlot} keyed on the hold's table and window,
 * excluding the reservation itself and the hold from the conflict re-check. In
 * one transaction it rewrites the reservation's date, times, table and party
 * size from the hold and deletes the hold. If the slot is lost (expired,
 * conflict, pacing) nothing is written, so the original booking is untouched.
 * `status` is never written.
 */
export async function moveReservationToHold(input: MoveToHoldInput): Promise<MoveToHoldResult> {
  const { reservation, holdId, sessionId, venueId, notes, actor = SYSTEM_ACTOR } = input;

  const hold = await prisma.reservationHold.findUnique({ where: { id: holdId } });
  if (!hold || hold.venueId !== venueId) {
    return { success: false, error: "Hold not found", errorCode: "NOT_FOUND" };
  }
  if (hold.sessionId !== sessionId) {
    return {
      success: false,
      error: "Session ID does not match the hold",
      errorCode: "SESSION_MISMATCH",
    };
  }

  const result = await bookSlot({
    tableId: hold.tableId,
    venueId: hold.venueId,
    date: hold.date,
    window: { startTime: hold.startTime, endTime: hold.endTime },
    partySize: hold.partySize,
    excludeReservationId: reservation.id,
    excludeHoldId: holdId,
    checkHoldConflict: true,
    checkPacing: true,
    guard: async () =>
      hold.expiresAt < new Date() ? { code: "EXPIRED", message: "Hold has expired" } : undefined,
    write: async (tx) => {
      const updated = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          date: hold.date,
          startTime: hold.startTime,
          endTime: hold.endTime,
          tableId: hold.tableId,
          partySize: hold.partySize,
          ...(notes !== undefined && { notes }),
        },
        include: {
          table: true,
          guest: { select: { visitCount: true, communicationPreference: true } },
        },
      });
      await recordReservationEvent(tx, {
        reservationId: reservation.id,
        venueId: reservation.venueId,
        kind: "moved",
        actor,
        from: toEventState({
          ...reservation,
          date: new Date(reservation.date),
          startTime: new Date(reservation.startTime),
          endTime: new Date(reservation.endTime),
        }),
        to: toEventState(updated),
      });
      await tx.reservationHold.delete({ where: { id: holdId } });
      return updated;
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

  return { success: true, reservation: toReservation(result.value) };
}
