import type { TFunction } from "i18next";
import type { AvailabilityDaySummary } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { visibleDates, type CalendarView } from "./calendar-dates.js";

/** The month ("October 2026") or the Monday-to-Sunday range ("Oct 26 – Nov 1, 2026") on show. */
export function periodLabel(
  view: CalendarView,
  anchor: string,
  t: TFunction,
  format: VenueFormat
): string {
  if (view === "month") {
    return format.formatCalendarDate(anchor, { month: "long", year: "numeric" });
  }
  const week = visibleDates("week", anchor);
  return t("availability.toolbar.range", {
    from: format.formatCalendarDate(week[0] ?? anchor, { month: "short", day: "numeric" }),
    to: format.formatCalendarDate(week[6] ?? anchor, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  });
}

/**
 * "This week: open 5 days · 1 closure · online booking on" for the anchor's week, from the days
 * already loaded. `null` until at least one day of that week has arrived.
 */
export function weekSummary(
  anchor: string,
  days: readonly AvailabilityDaySummary[] | undefined,
  t: TFunction
): string | null {
  const week = new Set(visibleDates("week", anchor));
  const loaded = (days ?? []).filter((d) => week.has(d.serviceDate));
  if (loaded.length === 0) return null;
  // A whole-day venue closure already empties `serviceCount`; booking, service and tables
  // closures leave the day open.
  const open = loaded.filter((d) => d.serviceCount > 0);
  const closures = new Set(loaded.flatMap((d) => d.closures.map((c) => c.ruleId)));
  const onlineOff = open.filter((d) => !d.bookingOpen.online).length;
  const online =
    onlineOff === open.length ? "onlineOff" : onlineOff === 0 ? "onlineOn" : "onlinePartial";
  return t("availability.weekSummary.line", {
    open: t("availability.weekSummary.open", { count: open.length }),
    closures: t("availability.weekSummary.closures", { count: closures.size }),
    online: t(`availability.weekSummary.${online}`),
  });
}
