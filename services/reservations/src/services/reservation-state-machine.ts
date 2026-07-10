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
