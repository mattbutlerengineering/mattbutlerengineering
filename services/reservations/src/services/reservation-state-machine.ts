import type { ReservationStatus } from "@mbe/types";
import { createStateMachine, TransitionError } from "./state-machine.js";

/**
 * Valid transitions for the reservation state machine.
 * PENDING → CONFIRMED | CANCELLED
 * CONFIRMED → COMPLETED | CANCELLED | NO_SHOW
 * COMPLETED, CANCELLED, NO_SHOW are terminal states (no valid outgoing transitions).
 */
const RESERVATION_TRANSITIONS: Partial<Record<ReservationStatus, ReservationStatus[]>> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const reservationMachine = createStateMachine<ReservationStatus>(
  RESERVATION_TRANSITIONS,
  "reservation"
);

/**
 * The allowed-transitions map — kept for callers that reference it directly.
 */
export const RESERVATION_VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> =
  RESERVATION_TRANSITIONS as Record<ReservationStatus, ReservationStatus[]>;

/**
 * Returns true if `from -> to` is a valid reservation state transition.
 */
export function isValidReservationTransition(
  from: ReservationStatus,
  to: ReservationStatus
): boolean {
  return reservationMachine.canTransition(from, to);
}

/**
 * Thrown when an invalid reservation state transition is attempted.
 * Alias of {@link TransitionError} for backward compatibility.
 */
export { TransitionError as ReservationTransitionError };

/**
 * Pure function that validates and returns the new state for a reservation transition.
 * Throws TransitionError (exported as ReservationTransitionError) if the transition is invalid.
 */
export function transitionReservation(
  from: ReservationStatus,
  to: ReservationStatus
): ReservationStatus {
  reservationMachine.transition(from, to);
  return to;
}
