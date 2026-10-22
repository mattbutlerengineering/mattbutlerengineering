/**
 * Catalog-backed copy derived from a built room layout.
 *
 * Kept out of the components that render it so those files export components
 * only (React fast refresh) and so a caller outside React can reach the same
 * wording — the mirror of `venue-onboarding/floor-plan-copy.ts`.
 */

import type { TFunction } from "i18next";
import type { RoomLayout } from "./room-templates.js";

/** "14 tables · 2 sections", or "An empty floor" for a layout with neither. */
export function layoutSummary(t: TFunction, layout: RoomLayout): string {
  if (layout.tables.length === 0 && layout.sections.length === 0) {
    return t("floorPlan.templates.summaryEmpty");
  }
  return t("floorPlan.templates.summary", {
    tables: t("floorPlan.templates.tableCount", { count: layout.tables.length }),
    sections: t("floorPlan.templates.sectionCount", { count: layout.sections.length }),
  });
}
