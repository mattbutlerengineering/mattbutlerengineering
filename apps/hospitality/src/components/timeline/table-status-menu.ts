import type { TFunction } from "i18next";
import { TABLE_VALID_TRANSITIONS, type TableStatus } from "@mbe/types";

export interface TableStatusMenuItem {
  id: TableStatus;
  label: string;
}

const TABLE_STATUS_KEYS = {
  AVAILABLE: "floorPlan.tableStatus.available",
  OCCUPIED: "floorPlan.tableStatus.occupied",
  DIRTY: "floorPlan.tableStatus.dirty",
  READY: "floorPlan.tableStatus.ready",
} as const satisfies Record<TableStatus, string>;

/** `"OCCUPIED"` → `"Occupied"` — the word the trigger's name and face speak. */
export function tableStatusWord(status: TableStatus, t: TFunction): string {
  if (status in TABLE_STATUS_KEYS) return t(TABLE_STATUS_KEYS[status]);
  // A status this build does not know (an API ahead of it): title-case the raw value.
  const lower = status.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** The word inside a sentence ("Mark occupied", "is now occupied"): lower-cased in the locale. */
export function tableStatusInline(status: TableStatus, t: TFunction, locale: string): string {
  return tableStatusWord(status, t).toLocaleLowerCase(locale);
}

/**
 * One "Mark <state>" item per transition the API itself allows — a projection
 * of `TABLE_VALID_TRANSITIONS`, never a second state machine. A status the
 * table does not know (an API ahead of this build) offers nothing.
 */
export function tableStatusMenuItems(
  status: TableStatus,
  t: TFunction,
  locale: string
): TableStatusMenuItem[] {
  if (!(status in TABLE_VALID_TRANSITIONS)) return [];
  return TABLE_VALID_TRANSITIONS[status].map((next) => ({
    id: next,
    label: t("timeline.tableMenu.mark", { status: tableStatusInline(next, t, locale) }),
  }));
}
