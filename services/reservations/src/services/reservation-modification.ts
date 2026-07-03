import type { FastifyBaseLogger } from "fastify";
import type { NotificationDispatcher } from "@mbe/notifications";
import type { CommunicationPreference, Reservation } from "@mbe/types";
import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import { depositService } from "./deposit.js";
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

const DEPOSIT_HELD_STATUSES = new Set(["pending", "held"]);

const PARTY_SIZE_DEPOSIT_BLOCKED_RESULT: ModifyReservationResult = {
  success: false,
  status: 409,
  title: "Party Size Change Blocked",
  detail:
    "This venue charges a per-person deposit and a payment is already pending or held for " +
    "this reservation. Cancel this reservation and create a new booking to change your party size.",
  code: "PARTY_SIZE_DEPOSIT_HELD",
};

/**
 * Guards against silently diverging a `per_person` deposit from the
 * reservation when partySize changes (#2931, decision: Block). Re-pricing an
 * in-place deposit was deliberately deferred — the guest-facing path is
 * cancel (deposit-safe, see reservation-cancellation.ts) and rebook, which
 * creates a correctly re-priced hold.
 *
 * Returns a blocking 409 result, or `null` when the change may proceed: the
 * partySize isn't actually changing, the venue isn't `per_person`, or there
 * is no `pending`/`held` deposit to diverge.
 */
async function checkPartySizeDepositGuard(
  reservation: Reservation,
  changes: ReservationChanges
): Promise<ModifyReservationResult | null> {
  if (changes.partySize === undefined || changes.partySize === reservation.partySize) {
    return null;
  }

  const rawVenue = reservation.venueId ? await venueService.getRawById(reservation.venueId) : null;
  if (rawVenue?.depositType !== "per_person") {
    return null;
  }

  const deposit = await depositService.getByReservationId(reservation.id);
  if (!deposit || !DEPOSIT_HELD_STATUSES.has(deposit.status)) {
    return null;
  }

  return PARTY_SIZE_DEPOSIT_BLOCKED_RESULT;
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

  const depositGuardResult = await checkPartySizeDepositGuard(reservation, changes);
  if (depositGuardResult) {
    return depositGuardResult;
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
