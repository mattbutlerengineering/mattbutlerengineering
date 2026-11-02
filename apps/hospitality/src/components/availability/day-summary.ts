import type { TFunction } from "i18next";
import type { AvailabilityDaySummary, DaySummaryService } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { closureBandText, isWholeDay, minuteText, type ClosureBandText } from "./closure-band.js";

export interface ServiceLineText {
  readonly key: string;
  /** "Lunch 11:00 AM – 2:00 PM". */
  readonly text: string;
}

/** What the quick setup and the legacy migration name the first schedule, before anyone renames it. */
const SEEDED_REGULAR_WEEK = "Regular week";

/**
 * A schedule's name is the Manager's own words and stays as typed, except the name the system
 * seeded in en-US, which reads in the viewer's language until someone renames it.
 */
export function scheduleNameText(name: string, t: TFunction): string {
  return name === SEEDED_REGULAR_WEEK ? t("availabilitySchedules.regularMarker") : name;
}

/**
 * `GET …/days` writes a day's label in en-US: "Closed", "Special hours" or "Open"
 * (`dayLabel` in the reservations service), or else the schedule's name. A schedule a Manager
 * really named "Closed" reads translated too, which says the same thing.
 */
export function dayLabelText(label: string, t: TFunction): string {
  switch (label) {
    case "Closed":
      return t("availability.calendar.dayLabel.closed");
    case "Special hours":
      return t("availability.calendar.dayLabel.specialHours");
    case "Open":
      return t("availability.calendar.dayLabel.open");
    default:
      return scheduleNameText(label, t);
  }
}

export interface DayPresentation {
  /** The day's label in the viewer's language. */
  readonly label: string | null;
  readonly bands: readonly ClosureBandText[];
  /** "2 services", or `null` when the count is not worth showing. */
  readonly count: string | null;
  /** One line per service, open to close; only populated when `detailed`. */
  readonly services: readonly ServiceLineText[];
  readonly onlineOff: boolean;
  /** The spoken details after the date: "Special hours, 2 services, closed 10:00 PM – 11:00 PM". */
  readonly accessibleDetails: string;
  /** The button's accessible name: "Friday, October 30: …". */
  readonly accessibleName: string;
}

function serviceLineText(
  service: DaySummaryService,
  t: TFunction,
  format: VenueFormat
): ServiceLineText {
  const text = t("availability.calendar.serviceLine", {
    name: service.name,
    from: minuteText(service.opensAt, t, format),
    to: minuteText(service.closesAt, t, format),
  });
  return { key: service.venueServiceId, text };
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
  const services = detailed
    ? (summary?.services ?? []).map((s) => serviceLineText(s, t, format))
    : [];
  // A whole-day pause that names online already says so; saying it twice reads as two facts.
  // The band names a channel only when it is the single one paused (closure-band.ts channelSuffix).
  const bandNamesOnline = (summary?.closures ?? []).some(
    (c) =>
      c.targetKind === "booking" &&
      isWholeDay(c) &&
      c.bookingTypes?.length === 1 &&
      c.bookingTypes[0] === "online"
  );
  const onlineOff = summary !== undefined && !summary.bookingOpen.online && !bandNamesOnline;

  const label = summary ? dayLabelText(summary.label, t) : null;
  const parts = summary
    ? [
        label,
        ...(count ? [count] : []),
        ...bands.map((b) => b.name),
        ...services.map((s) => s.text),
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
    label,
    bands,
    count,
    services,
    onlineOff,
    accessibleDetails,
    accessibleName: t("availability.calendar.cellName", {
      date: fullDate,
      details: accessibleDetails,
    }),
  };
}
