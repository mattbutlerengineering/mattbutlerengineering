import type { DepositStatus } from "../generated/prisma/index.js";
import { createStateMachine, TransitionError } from "./state-machine.js";

/**
 * Valid transitions for the deposit state machine.
 * pending → held → applied | refunded | partial_refunded | forfeited
 * applied, refunded, partial_refunded, forfeited are terminal states
 * (no valid outgoing transitions).
 */
const DEPOSIT_TRANSITIONS: Partial<Record<DepositStatus, DepositStatus[]>> = {
  pending: ["held"],
  held: ["applied", "refunded", "partial_refunded", "forfeited"],
  applied: [],
  refunded: [],
  partial_refunded: [],
  forfeited: [],
};

export const depositMachine = createStateMachine<DepositStatus>(DEPOSIT_TRANSITIONS, "deposit");

/**
 * Thrown when an invalid deposit state transition is attempted.
 * Alias of {@link TransitionError} for backward compatibility.
 */
export { TransitionError as DepositTransitionError };

/**
 * Pure function that validates and returns the new state for a deposit transition.
 * Throws TransitionError (exported as DepositTransitionError) if the transition is invalid.
 */
export function transitionDeposit(from: DepositStatus, to: DepositStatus): DepositStatus {
  depositMachine.transition(from, to);
  return to;
}
