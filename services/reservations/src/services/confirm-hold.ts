import type { ConfirmHoldRequest, Reservation } from "@mbe/types";
import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import type { GateRejection } from "./assert-bookable.js";
import { bookSlot } from "./book-slot.js";
import { toReservation } from "./serializers.js";
import {
  recordReservationEvent,
  toEventState,
  SYSTEM_ACTOR,
  type ReservationEventActor,
} from "./reservation-events.js";

type ConfirmHoldErrorCode =
  "NOT_FOUND" | "EXPIRED" | "SESSION_MISMATCH" | "CONFLICT" | "PACING_EXCEEDED" | "NOT_BOOKABLE";

export interface ConfirmHoldInput {
  holdId: string;
  sessionId?: string;
  guestDetails: ConfirmHoldRequest;
  userId?: string;
  /**
   * When provided, the hold must belong to this venue. Set by the slug-scoped
   * public route (#4487) so a hold id from one venue cannot be confirmed
   * through another venue's URL. A mismatch is reported as `NOT_FOUND`, never
   * as a distinct error — the caller must not learn the hold exists elsewhere.
   * Checked in the same lookup as the session id, before any write.
   */
  venueId?: string;
  /** Who confirmed; recorded on the `created` event. Defaults to {@link SYSTEM_ACTOR}. */
  actor?: ReservationEventActor;
  /**
   * Runs inside the confirm transaction, after the reservation insert. Throwing
   * rolls the whole confirm back (the hold survives for the caller to release).
   */
  inTransaction?: (tx: Prisma.TransactionClient, reservationId: string) => Promise<void>;
}

export type ConfirmHoldResult =
  | { success: true; reservation: Reservation }
  | {
      success: false;
      error: string;
      errorCode: ConfirmHoldErrorCode;
      /** Set with `NOT_BOOKABLE`: the availability gate's refusal (route answers 422). */
      rejection?: GateRejection;
    };

/**
 * Orchestrates hold-to-reservation confirmation.
 *
 * Steps:
 * 1. Look up hold by ID
 * 2. If sessionId provided, validate it matches
 * 3. bookSlot: advisory lock -> expiry guard -> conflict re-check -> availability
 *    gate (pacing, closures) -> create reservation -> delete hold
 * 4. Return reservation (the `hold:confirmed` live event is set off by the
 *    reservation-transitions `confirmHold` verb, through the live emitter)
 *
 * The advisory lock, expiry guard, and conflict re-check all run inside
 * the shared {@link bookSlot} seam so two concurrent confirmations (or a confirm
 * racing a walk-in create) on the same table serialize on the lock key and
 * cannot both pass their conflict checks and commit (write-skew double-booking).
 */
export async function confirmHold(input: ConfirmHoldInput): Promise<ConfirmHoldResult> {
  const { holdId, sessionId, guestDetails, userId, venueId, actor = SYSTEM_ACTOR } = input;

  // Step 1: Look up hold
  const hold = await prisma.reservationHold.findUnique({
    where: { id: holdId },
  });

  if (!hold) {
    return { success: false, error: "Hold not found", errorCode: "NOT_FOUND" };
  }

  // Step 1.5: Venue scoping (only when venueId is provided — slug-scoped public path)
  if (venueId !== undefined && hold.venueId !== venueId) {
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

  // Step 3: Atomic slot write under the advisory lock + transaction.
  const result = await bookSlot({
    tableId: hold.tableId,
    venueId: hold.venueId,
    date: hold.date,
    window: { startTime: hold.startTime, endTime: hold.endTime },
    partySize: hold.partySize,
    excludeHoldId: holdId,
    checkHoldConflict: true,
    // Re-judge the slot against the committed availability, so a closure saved
    // after the hold was created wins over the hold.
    gate: { channel: "online" },
    // Re-check expiry under the lock so an expired hold never produces a
    // reservation, even if it expired between the lookup and acquiring the lock.
    guard: async () =>
      hold.expiresAt < new Date() ? { code: "EXPIRED", message: "Hold has expired" } : undefined,
    // Every unbookable outcome (expired, conflict, gate refusal) consumes the hold.
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
          occasion: guestDetails.occasion ?? null,
          seatingPreference: guestDetails.seatingPreference ?? null,
          userId: userId ?? null,
          // Ownership proof for the public deposit route (#6304).
          originSessionId: hold.sessionId,
          status: "CONFIRMED",
        },
        include: {
          table: true,
          guest: { select: { visitCount: true, communicationPreference: true } },
        },
      });

      await recordReservationEvent(tx, {
        reservationId: reservation.id,
        venueId: reservation.venueId,
        kind: "created",
        actor,
        from: null,
        to: toEventState(reservation),
      });

      // Delete the hold in the same transaction as the reservation insert.
      await tx.reservationHold.delete({ where: { id: holdId } });

      await input.inTransaction?.(tx, reservation.id);

      return reservation;
    },
  });

  if (!result.ok) {
    const { conflict } = result;
    if (conflict.code === "NOT_BOOKABLE") {
      const { message: error, rejection } = conflict;
      return { success: false, error, errorCode: "NOT_BOOKABLE", rejection };
    }
    if (conflict.code === "EXPIRED") {
      return { success: false, error: "Hold has expired", errorCode: "EXPIRED" };
    }
    return { success: false, error: "Time slot is no longer available", errorCode: "CONFLICT" };
  }

  // Step 4: Map to domain type
  return { success: true, reservation: toReservation(result.value) };
}
