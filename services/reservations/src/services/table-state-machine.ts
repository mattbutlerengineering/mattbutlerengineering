import type { TableStatus } from "../generated/prisma/index.js";

/**
 * Valid transitions for the table state machine.
 * AVAILABLE → OCCUPIED → DIRTY → READY → AVAILABLE
 */
export const TABLE_VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  AVAILABLE: ["OCCUPIED"],
  OCCUPIED: ["DIRTY"],
  DIRTY: ["READY"],
  READY: ["AVAILABLE"],
};

/**
 * Returns true if `from -> to` is a valid table state transition.
 */
export function isValidTableTransition(from: TableStatus, to: TableStatus): boolean {
  return TABLE_VALID_TRANSITIONS[from].includes(to);
}

/**
 * Custom error thrown when an invalid table state transition is attempted.
 */
export class TableTransitionError extends Error {
  readonly from: TableStatus;
  readonly to: TableStatus;

  constructor(from: TableStatus, to: TableStatus) {
    super(
      `Invalid table transition: cannot transition from '${from}' to '${to}'. Valid transitions from '${from}': [${TABLE_VALID_TRANSITIONS[from].join(", ") || "none"}]`
    );
    this.name = "TableTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Pure function that validates and returns the new state for a table transition.
 * Throws TableTransitionError if the transition is invalid.
 */
export function transitionTable(from: TableStatus, to: TableStatus): TableStatus {
  if (!isValidTableTransition(from, to)) {
    throw new TableTransitionError(from, to);
  }
  return to;
}
