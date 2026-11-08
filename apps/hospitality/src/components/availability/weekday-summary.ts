import type { TFunction } from "i18next";
import { addDays } from "@mbe/availability";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { weekdayRuns } from "./schedule-changes.js";

/** A known Sunday, so a weekday index plus this date names that weekday in any locale. */
const SUNDAY = "2026-10-25";

/**
 * Weekdays (0 = Sunday) as one phrase: "Mon–Thu", "Wed and Sat–Sun", or "every day". The
 * regular-week line, the schedule drawers and History all say a set of days this way.
 */
export function weekdaySummary(
  weekdays: readonly number[],
  format: Pick<VenueFormat, "formatCalendarDate" | "locale">,
  t: TFunction
): string {
  if (weekdays.length === 7) return t("availabilitySchedules.everyDay");
  const name = (day: number) =>
    format.formatCalendarDate(addDays(SUNDAY, day), { weekday: "short" });
  return new Intl.ListFormat(format.locale, { type: "conjunction" }).format(
    weekdayRuns(weekdays).map(([a, b]) => (a === b ? name(a) : `${name(a)}–${name(b)}`))
  );
}
