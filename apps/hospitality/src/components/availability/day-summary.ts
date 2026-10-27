import type { TFunction } from "i18next";
import type { AvailabilityDaySummary } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { closureBandText, isWholeDay, type ClosureBandText } from "./closure-band.js";

export interface DayPresentation {
  readonly bands: readonly ClosureBandText[];
  /** "2 services", or `null` when the count is not worth showing. */
  readonly count: string | null;
  readonly onlineOff: boolean;
  /** The spoken details after the date: "Special hours, 2 services, closed 10:00 PM – 11:00 PM". */
  readonly accessibleDetails: string;
  /** The button's accessible name: "Friday, October 30: …". */
  readonly accessibleName: string;
}

/** What a calendar cell or agenda row shows for one day, and how it is spoken. */
export function presentDay(
  date: string,
  summary: AvailabilityDaySummary | undefined,
  detailed: boolean,
  t: TFunction,
  format: VenueFormat
): DayPresentation {
  const bands = (summary?.closures ?? []).map((c) => closureBandText(c, t, format));
  const showCount = summary !== undefined && (detailed || summary.serviceCount >= 2);
  const count = showCount
    ? t("availability.calendar.services", { count: summary.serviceCount })
    : null;
  // A whole-day pause that names online already says so; saying it twice reads as two facts.
  const bandNamesOnline = (summary?.closures ?? []).some(
    (c) => c.targetKind === "booking" && isWholeDay(c) && c.bookingTypes?.includes("online")
  );
  const onlineOff = summary !== undefined && !summary.bookingOpen.online && !bandNamesOnline;

  const parts = summary
    ? [
        summary.label,
        ...(count ? [count] : []),
        ...bands.map((b) => b.name),
        ...(onlineOff ? [t("availability.calendar.onlineOffName")] : []),
      ]
    : [t("availability.calendar.loadingDay")];
  const accessibleDetails = parts.join(", ");
  const fullDate = format.formatCalendarDate(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return {
    bands,
    count,
    onlineOff,
    accessibleDetails,
    accessibleName: t("availability.calendar.cellName", {
      date: fullDate,
      details: accessibleDetails,
    }),
  };
}
