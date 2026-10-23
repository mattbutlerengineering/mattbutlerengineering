import type { TFunction } from "i18next";
import type { DraftTable } from "./floor-plan-draft.js";

/** "14 tables" and "48 seats" for a layout, pluralized by the active locale. */
export function layoutCounts(
  t: TFunction,
  tables: readonly DraftTable[]
): { tables: string; seats: string } {
  const seats = tables.reduce((sum, table) => sum + table.capacity, 0);
  return {
    tables: t("onboarding.floorPlan.tableCount", { count: tables.length }),
    seats: t("onboarding.floorPlan.seatCount", { count: seats }),
  };
}
