import type { ReservationStatus } from "@mbe/types";

/**
 * Valid transitions for the reservation state machine.
 * PENDING → CONFIRMED | CANCELLED
 * CONFIRMED → COMPLETED | CANCELLED | NO_SHOW
 * COMPLETED, CANCELLED, NO_SHOW are terminal states (no valid outgoing transitions).
 */
export const RESERVATION_VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/**
 * Returns true if `from -> to` is a valid reservation state transition.
 */
export function isValidReservationTransition(
  from: ReservationStatus,
  to: ReservationStatus
): boolean {
  return RESERVATION_VALID_TRANSITIONS[from].includes(to);
}

/**
 * Custom error thrown when an invalid reservation state transition is attempted.
 */
export class ReservationTransitionError extends Error {
  readonly from: ReservationStatus;
  readonly to: ReservationStatus;

  constructor(from: ReservationStatus, to: ReservationStatus) {
    super(
      `Invalid reservation transition: cannot transition from '${from}' to '${to}'. Valid transitions from '${from}': [${RESERVATION_VALID_TRANSITIONS[from].join(", ") || "none"}]`
    );
    this.name = "ReservationTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Pure function that validates and returns the new state for a reservation transition.
 * Throws ReservationTransitionError if the transition is invalid.
 */
export function transitionReservation(
  from: ReservationStatus,
  to: ReservationStatus
): ReservationStatus {
  if (!isValidReservationTransition(from, to)) {
    throw new ReservationTransitionError(from, to);
  }
  return to;
}
