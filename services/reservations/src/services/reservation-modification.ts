import type { FastifyBaseLogger } from "fastify";
import type { NotificationDispatcher } from "@mbe/notifications";
import type { CommunicationPreference, Reservation } from "@mbe/types";
import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import type { BookingNotifier } from "./booking-notifications.js";

export interface ModifyReservationDeps {
  bookingNotifier: BookingNotifier;
  notificationPort: NotificationDispatcher;
  logger: FastifyBaseLogger;
}

/** Guest-supplied fields for a modify request; all optional (at least one required). */
export interface ReservationChanges {
  date?: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
  specialRequests?: string;
}

export type ModifyReservationResult =
  | { success: true; reservation: Reservation }
  | { success: false; status: number; title: string; detail: string; code: string };

const NO_CHANGES_RESULT: ModifyReservationResult = {
  success: false,
  status: 400,
  title: "No Changes",
  detail: "At least one field must be provided to modify",
  code: "NO_CHANGES_PROVIDED",
};

function hasAnyChange(changes: ReservationChanges): boolean {
  return (
    changes.date !== undefined ||
    changes.startTime !== undefined ||
    changes.endTime !== undefined ||
    changes.partySize !== undefined ||
    changes.specialRequests !== undefined
  );
}

function isTimeChange(changes: ReservationChanges): boolean {
  return (
    changes.date !== undefined || changes.startTime !== undefined || changes.endTime !== undefined
  );
}

/**
 * Deposit repricing on a partySize change is explicitly OUT of scope here.
 * Whether/how a `per_person` deposit should be re-evaluated when partySize
 * changes is a separate, HITL product decision tracked in #2931 — this
 * function is the named seam where that logic will land. Today it is a
 * deliberate no-op: partySize changes never touch the deposit.
 */
export function skipDepositRepricingOnPartySizeChange(
  _reservation: Reservation,
  _changes: ReservationChanges
): void {
  // Intentional no-op — see #2931 for the pending repricing decision.
}

/**
 * Reschedules reminder jobs iff the time changed, then dispatches the
 * guest-facing "modified" notification. Both are best-effort: neither
 * failure should undo the update, which has already committed.
 */
async function notifyModification(
  updated: Reservation,
  manageToken: string,
  timeChanged: boolean,
  deps: ModifyReservationDeps
): Promise<void> {
  const { bookingNotifier, notificationPort, logger } = deps;

  if (timeChanged) {
    bookingNotifier
      .rescheduleBookingReminders(updated, manageToken)
      .catch((err) => logger.error({ err }, "Failed to reschedule booking reminders"));
  }

  const venue = updated.venueId ? await venueService.getById(updated.venueId) : null;
  if (!updated.guestEmail || !venue) return;

  const preference =
    (updated.guest?.communicationPreference as CommunicationPreference | null) ?? "email_only";
  try {
    await notificationPort.sendBookingModified(
      {
        reservationId: updated.id,
        date: updated.date,
        startTime: updated.startTime,
        endTime: updated.endTime,
        partySize: updated.partySize,
        guestName: updated.guestName,
        guestEmail: updated.guestEmail,
        guestPhone: updated.guestPhone ?? null,
        specialRequests: updated.notes ?? null,
        venueName: venue.name,
        venueTimezone: venue.ianaTimezone,
        venueAddress: null,
        manageToken,
        sequence: 2,
      },
      preference
    );
  } catch {
    logger.error("Failed to send booking modified notification");
  }
}

/**
 * Domain-level modify: validates that at least one field was provided,
 * builds the update payload, dispatches the conflict-checked update,
 * reschedules reminder jobs iff the time changed, and dispatches the
 * guest-facing "modified" notification. Callers (routes) are thin adapters
 * that translate the result into an HTTP response.
 */
export async function modifyReservationWithNotifications(
  reservation: Reservation,
  changes: ReservationChanges,
  manageToken: string,
  deps: ModifyReservationDeps
): Promise<ModifyReservationResult> {
  if (!hasAnyChange(changes)) {
    return NO_CHANGES_RESULT;
  }

  if (changes.partySize !== undefined) {
    skipDepositRepricingOnPartySizeChange(reservation, changes);
  }

  const { date, startTime, endTime, partySize, specialRequests } = changes;
  const updateData = {
    ...(date !== undefined && { date }),
    ...(startTime !== undefined && { startTime }),
    ...(endTime !== undefined && { endTime }),
    ...(partySize !== undefined && { partySize }),
    ...(specialRequests !== undefined && { notes: specialRequests }),
  };

  const updateResult = await reservationService.updateWithConflictCheck(reservation.id, updateData);

  if (!updateResult.success) {
    if (updateResult.conflict) {
      return {
        success: false,
        status: 409,
        title: "Slot Unavailable",
        detail: updateResult.error!,
        code: "SLOT_UNAVAILABLE",
      };
    }
    return {
      success: false,
      status: 500,
      title: "Update Failed",
      detail: updateResult.error ?? "Failed to modify reservation",
      code: "RESERVATION_UPDATE_FAILED",
    };
  }

  const updated = updateResult.reservation!;
  await notifyModification(updated, manageToken, isTimeChange(changes), deps);

  return { success: true, reservation: updated };
}
