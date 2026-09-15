import { TABLE_VALID_TRANSITIONS, type TableStatus } from "@mbe/types";

export interface TableStatusMenuItem {
  id: TableStatus;
  label: string;
}

/**
 * One "Mark <state>" item per transition the API itself allows — a projection
 * of `TABLE_VALID_TRANSITIONS`, never a second state machine. A status the
 * table does not know (an API ahead of this build) offers nothing.
 */
export function tableStatusMenuItems(status: TableStatus): TableStatusMenuItem[] {
  if (!(status in TABLE_VALID_TRANSITIONS)) return [];
  return TABLE_VALID_TRANSITIONS[status].map((next) => ({
    id: next,
    label: `Mark ${next.toLowerCase()}`,
  }));
}

/** `"OCCUPIED"` → `"Occupied"` — the word the trigger's name and face speak. */
export function tableStatusWord(status: TableStatus): string {
  const lower = status.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
