import type { DepositStatus } from "../generated/prisma/index.js";

/**
 * Valid transitions for the deposit state machine.
 * pending → held → applied | refunded | forfeited
 * applied, refunded, forfeited are terminal states (no valid outgoing transitions).
 */
export const VALID_TRANSITIONS: Record<DepositStatus, DepositStatus[]> = {
  pending: ["held"],
  held: ["applied", "refunded", "forfeited"],
  applied: [],
  refunded: [],
  forfeited: [],
};

/**
 * Returns true if `from -> to` is a valid deposit state transition.
 */
export function isValidTransition(from: DepositStatus, to: DepositStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Custom error thrown when an invalid deposit state transition is attempted.
 */
export class DepositTransitionError extends Error {
  readonly from: DepositStatus;
  readonly to: DepositStatus;

  constructor(from: DepositStatus, to: DepositStatus) {
    super(
      `Invalid deposit transition: cannot transition from '${from}' to '${to}'. Valid transitions from '${from}': [${VALID_TRANSITIONS[from].join(", ") || "none"}]`
    );
    this.name = "DepositTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Pure function that validates and returns the new state for a deposit transition.
 * Throws DepositTransitionError if the transition is invalid.
 */
export function transitionDeposit(from: DepositStatus, to: DepositStatus): DepositStatus {
  if (!isValidTransition(from, to)) {
    throw new DepositTransitionError(from, to);
  }
  return to;
}
