import type { Reservation } from "@mbe/types";
import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import { prisma } from "./database.js";
import { moveReservationToHold } from "./move-to-hold.js";
import {
  bookingWindow,
  checkGuestModificationPolicy,
  isSlotInBookingWindow,
} from "./slot-rules.js";
import type { DepositService } from "./deposit.js";

/** Guest-supplied fields for a modify request; all optional (at least one required). */
export interface ReservationChanges {
  date?: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
  specialRequests?: string;
}

/** The guest's hold on the slot a date/time/party-size change moves to. */
export interface ModifyHold {
  holdId: string;
  sessionId: string;
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

/** Whether a change moves the booking onto a different slot or party size. */
function needsHold(changes: ReservationChanges): boolean {
  return isTimeChange(changes) || changes.partySize !== undefined;
}

const HOLD_REQUIRED_RESULT: ModifyReservationResult = {
  success: false,
  status: 400,
  title: "Hold Required",
  detail: "Changing the date, time or party size requires a hold on the new slot",
  code: "HOLD_REQUIRED",
};

/** moveReservationToHold failure code -> HTTP result. */
const MOVE_ERROR_RESULTS = {
  NOT_FOUND: { status: 404, title: "Hold Not Found", code: "HOLD_NOT_FOUND" },
  SESSION_MISMATCH: { status: 403, title: "Forbidden", code: "HOLD_SESSION_MISMATCH" },
  EXPIRED: { status: 410, title: "Hold Expired", code: "HOLD_EXPIRED" },
  CONFLICT: { status: 409, title: "Slot Unavailable", code: "SLOT_UNAVAILABLE" },
  PACING_EXCEEDED: { status: 422, title: "Pacing Exceeded", code: "PACING_EXCEEDED" },
} as const;

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

const BOOKING_WINDOW_RESULT: ModifyReservationResult = {
  success: false,
  status: 422,
  title: "Outside Booking Window",
  detail: "The requested time is outside the venue's booking window",
  code: "BOOKING_WINDOW_VIOLATION",
};

type ModifyVenue = NonNullable<Awaited<ReturnType<typeof venueService.getById>>>;

/**
 * A guest moving their own booking is bound by the same booking window as
 * availability and hold creation (#6560): not in the past, within the venue's
 * min/max advance. Only a change to the start (startTime or date) is checked,
 * so an unrelated edit to an imminent booking is never blocked by minAdvance.
 * Returns a blocking 422 result, or `null` when the change may proceed.
 */
function checkBookingWindow(
  venue: ModifyVenue,
  reservation: Reservation,
  changes: ReservationChanges
): ModifyReservationResult | null {
  if (changes.startTime === undefined && changes.date === undefined) return null;

  const newStart = new Date(changes.startTime ?? reservation.startTime);
  // The route's body schema guarantees a date-time; an unparseable value
  // cannot be placed in the window, so leave it to the conflict check.
  if (Number.isNaN(newStart.getTime())) return null;

  const window = bookingWindow(venue.settings, new Date(), venue.ianaTimezone);
  return isSlotInBookingWindow(newStart, window) ? null : BOOKING_WINDOW_RESULT;
}

const GUEST_POLICY_RESULTS = {
  MODIFICATION_CUTOFF: {
    success: false,
    status: 422,
    title: "Too Close To Reservation Time",
    detail: "This venue does not allow changes this close to your reservation. Please call us.",
    code: "MODIFICATION_CUTOFF",
  },
  PARTY_SIZE_CHANGE_TOO_LARGE: {
    success: false,
    status: 422,
    title: "Party Size Change Too Large",
    detail: "This venue limits how much you can change your party size online. Please call us.",
    code: "PARTY_SIZE_CHANGE_TOO_LARGE",
  },
} as const satisfies Record<string, ModifyReservationResult>;

/**
 * The venue's limits on guest self-service changes (cutoff hours, party-size
 * delta). Returns a blocking 422 result, or `null` when the change may proceed.
 */
function checkGuestPolicy(
  venue: ModifyVenue,
  reservation: Reservation,
  changes: ReservationChanges
): ModifyReservationResult | null {
  const violation = checkGuestModificationPolicy(
    venue.settings,
    { startTime: new Date(reservation.startTime), partySize: reservation.partySize },
    { partySize: changes.partySize, movesTime: isTimeChange(changes) },
    new Date()
  );
  return violation ? GUEST_POLICY_RESULTS[violation] : null;
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
  deposits: DepositService,
  hold?: ModifyHold
): Promise<ModifyReservationResult> {
  if (!hasAnyChange(changes) && !hold) {
    return NO_CHANGES_RESULT;
  }

  if (needsHold(changes) && !hold) {
    return HOLD_REQUIRED_RESULT;
  }

  if (hold) {
    return modifyViaHold(reservation, changes, deposits, hold);
  }

  // Only a specialRequests edit reaches here: it needs no hold, no venue and
  // no conflict check.
  const updateResult = await reservationService.updateWithConflictCheck(reservation.id, {
    notes: changes.specialRequests,
  });
  if (!updateResult.success) {
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

/**
 * A change onto a held slot: the deposit guard, booking window and venue
 * policy are checked against the hold's slot, then the reservation is moved
 * onto it atomically. A lost race leaves the original booking untouched.
 */
async function modifyViaHold(
  reservation: Reservation,
  changes: ReservationChanges,
  deposits: DepositService,
  { holdId, sessionId }: ModifyHold
): Promise<ModifyReservationResult> {
  const venueId = reservation.venueId;
  const held = venueId ? await prisma.reservationHold.findUnique({ where: { id: holdId } }) : null;
  if (!held || held.venueId !== venueId) {
    return { success: false, detail: "Hold not found", ...MOVE_ERROR_RESULTS.NOT_FOUND };
  }
  if (held.sessionId !== sessionId) {
    return {
      success: false,
      detail: "Session ID does not match the hold",
      ...MOVE_ERROR_RESULTS.SESSION_MISMATCH,
    };
  }

  // The hold's slot is the change; whatever else the body carried is ignored.
  const heldChanges: ReservationChanges = {
    date: held.date.toISOString().slice(0, 10),
    startTime: held.startTime.toISOString(),
    endTime: held.endTime.toISOString(),
    partySize: held.partySize,
  };

  const depositGuardResult = await checkPartySizeDepositGuard(reservation, heldChanges, deposits);
  if (depositGuardResult) {
    return depositGuardResult;
  }

  const venue = await venueService.getById(venueId);
  if (venue) {
    const blocked =
      checkGuestPolicy(venue, reservation, heldChanges) ??
      checkBookingWindow(venue, reservation, heldChanges);
    if (blocked) return blocked;
  }

  const moved = await moveReservationToHold({
    reservation,
    holdId,
    sessionId,
    venueId: venueId,
    notes: changes.specialRequests,
  });
  if (!moved.success) {
    return { success: false, detail: moved.error, ...MOVE_ERROR_RESULTS[moved.errorCode] };
  }
  return { success: true, reservation: moved.reservation };
}
