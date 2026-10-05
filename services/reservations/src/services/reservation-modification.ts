import type { Reservation } from "@mbe/types";
import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import type { DepositService } from "./deposit.js";

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

/** Whether a guest change moves the reservation in time (date, start or end). */
export function isTimeChange(changes: ReservationChanges): boolean {
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
 * Whether changing `reservation`'s partySize to `newPartySize` would
 * silently diverge a `per_person` deposit (#2931, decision: Block).
 * Re-pricing an in-place deposit was deliberately deferred, so any caller
 * that accepts a partySize update on a reservation (guest self-service or
 * staff) must consult this before applying the change — see #2998, which
 * closed the staff-route bypass of this same check.
 *
 * Returns `false` when the change may proceed: the partySize isn't actually
 * changing, the venue isn't `per_person`, or there is no `pending`/`held`
 * deposit to diverge.
 */
export async function isPartySizeDepositBlocked(
  reservation: Reservation,
  newPartySize: number | undefined,
  deposits: DepositService
): Promise<boolean> {
  if (newPartySize === undefined || newPartySize === reservation.partySize) {
    return false;
  }

  const venuePolicy = reservation.venueId
    ? await venueService.getPolicyById(reservation.venueId)
    : null;
  if (venuePolicy?.depositType !== "per_person") {
    return false;
  }

  const deposit = await deposits.getByReservationId(reservation.id);
  return Boolean(deposit && DEPOSIT_HELD_STATUSES.has(deposit.status));
}

/**
 * Guest-facing adapter over {@link isPartySizeDepositBlocked}: returns a
 * blocking 409 result, or `null` when the change may proceed.
 */
async function checkPartySizeDepositGuard(
  reservation: Reservation,
  changes: ReservationChanges,
  deposits: DepositService
): Promise<ModifyReservationResult | null> {
  const blocked = await isPartySizeDepositBlocked(reservation, changes.partySize, deposits);
  return blocked ? PARTY_SIZE_DEPOSIT_BLOCKED_RESULT : null;
}

/**
 * Domain-level modify: validates that at least one field was provided,
 * builds the update payload and dispatches the conflict-checked update.
 * What a committed modify sets off (reminder reschedule, guest emails, live
 * events) is decided by the reservation-transitions effects table
 * (`transitions/plan.ts`), whose `modifyByGuest` verb wraps this function.
 */
export async function modifyReservation(
  reservation: Reservation,
  changes: ReservationChanges,
  deposits: DepositService
): Promise<ModifyReservationResult> {
  if (!hasAnyChange(changes)) {
    return NO_CHANGES_RESULT;
  }

  const depositGuardResult = await checkPartySizeDepositGuard(reservation, changes, deposits);
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
    if (updateResult.capacityExceeded) {
      return {
        success: false,
        status: 422,
        title: "Party Size Exceeds Table Capacity",
        detail: updateResult.error!,
        code: "PARTY_SIZE_EXCEEDS_TABLE",
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

  return { success: true, reservation: updateResult.reservation! };
}
