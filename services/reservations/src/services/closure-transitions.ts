import type { FastifyBaseLogger } from "fastify";
import type { ClosureTransitions } from "./closure-apply.js";
import type { DepositService } from "./deposit.js";
import type { reservationService as ReservationService } from "./reservation.js";
import { cancelReservationWithDeposit } from "./reservation-cancellation.js";
import { staffActor } from "./reservation-events.js";

/**
 * The closure command's reservation transitions, as the staff who saved the
 * closure. The cancel is `cancelReservationWithDeposit` with the staff
 * initiator, so a held deposit is refunded in full and the fee waived; it and
 * the move each record the reservation event. They send no guest notice: the
 * closure notices are #7523's.
 */
export function createClosureTransitions(deps: {
  reservationService: typeof ReservationService;
  deposits: DepositService;
  logger: FastifyBaseLogger;
  actorId: string | undefined;
}): ClosureTransitions {
  const { reservationService, deposits, logger } = deps;
  const actor = staffActor(deps.actorId);
  return {
    async cancel(reservationId) {
      const reservation = await reservationService.getById(reservationId);
      if (!reservation) return { ok: false, reason: "Reservation not found" };
      const result = await cancelReservationWithDeposit(
        reservation,
        "",
        { logger, deposits },
        {
          initiator: "staff",
          cancellationReason: "venue_closure",
          cancellationNote: "Cancelled by the venue: closure",
          actor,
        }
      );
      return result.success ? { ok: true } : { ok: false, reason: result.detail };
    },

    async move(reservationId, to) {
      const result = await reservationService.updateWithConflictCheck(
        reservationId,
        { startTime: to.startTime.toISOString(), endTime: to.endTime.toISOString() },
        actor
      );
      if (result.success) return { ok: true };
      return {
        ok: false,
        reason:
          result.error ?? (result.rejection ? "The new time is not bookable" : "Could not move"),
      };
    },
  };
}
