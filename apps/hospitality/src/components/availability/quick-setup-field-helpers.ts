import { addDays } from "@mbe/availability";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import {
  WEEK_DISPLAY_ORDER,
  type QuickSetupField,
  type QuickSetupIssue,
} from "./quick-setup-draft.js";

/** A fixed Monday: weekday names come from the active locale, never a hand-kept list. */
const SAMPLE_MONDAY = "2026-10-26";
const DAYS_FIELD_ID = "quick-setup-days";

/** The DOM id of a field, so the owner can move focus to the first invalid one. */
export function quickSetupFieldId(
  serviceId: string | null,
  field: QuickSetupField | "days",
  blockId?: string
) {
  if (serviceId === null) return DAYS_FIELD_ID;
  return `quick-setup-${serviceId}${blockId === undefined ? "" : `-${blockId}`}-${field}`;
}

export function issuesFor(
  issues: readonly QuickSetupIssue[],
  serviceId: string | null,
  field: string,
  blockId?: string
) {
  return issues.filter(
    (i) => i.serviceId === serviceId && i.field === field && i.blockId === blockId
  );
}

/** A stored weekday index (0 = Sunday) as its name in the active locale. */
export function useWeekdayName() {
  const format = useVenueFormat();
  return (day: number, weekday: "long" | "short" = "long") =>
    format.formatCalendarDate(addDays(SAMPLE_MONDAY, WEEK_DISPLAY_ORDER.indexOf(day)), { weekday });
}
