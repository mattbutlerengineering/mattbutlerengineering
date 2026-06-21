import type { TableStatus } from "../generated/prisma/index.js";
import { createStateMachine, TransitionError } from "./state-machine.js";

/**
 * Valid transitions for the table state machine.
 * AVAILABLE → OCCUPIED → DIRTY → READY → AVAILABLE
 */
const TABLE_TRANSITIONS: Partial<Record<TableStatus, TableStatus[]>> = {
  AVAILABLE: ["OCCUPIED"],
  OCCUPIED: ["DIRTY"],
  DIRTY: ["READY"],
  READY: ["AVAILABLE"],
};

export const tableMachine = createStateMachine<TableStatus>(TABLE_TRANSITIONS, "table");

/**
 * The allowed-transitions map — kept for callers that reference it directly.
 */
export const TABLE_VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> =
  TABLE_TRANSITIONS as Record<TableStatus, TableStatus[]>;

/**
 * Returns true if `from -> to` is a valid table state transition.
 */
export function isValidTableTransition(from: TableStatus, to: TableStatus): boolean {
  return tableMachine.canTransition(from, to);
}

/**
 * Thrown when an invalid table state transition is attempted.
 * Alias of {@link TransitionError} for backward compatibility.
 */
export { TransitionError as TableTransitionError };

/**
 * Pure function that validates and returns the new state for a table transition.
 * Throws TransitionError (exported as TableTransitionError) if the transition is invalid.
 */
export function transitionTable(from: TableStatus, to: TableStatus): TableStatus {
  tableMachine.transition(from, to);
  return to;
}
