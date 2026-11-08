import type { TFunction } from "i18next";
import type { AvailabilityDaySummary, DaySummaryService } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { filterDaySummary, type ServiceFilter } from "./service-filter.js";
import { closureBandText, isWholeDay, minuteText, type ClosureBandText } from "./closure-band.js";

export interface ServiceLineText {
  readonly key: string;
  /** "Lunch 11:00 AM – 1:30 PM": first to last time a guest can book, not open to close. */
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

/** How a day departs from its schedule, so a closed or special-hours day stands out in a month of regular days. */
export type DayTone = "closed" | "special";

export interface DayPresentation {
  /** The day's label in the viewer's language. */
  readonly label: string | null;
  readonly tone: DayTone | null;
  readonly bands: readonly ClosureBandText[];
  /**
   * Month view's one line about the services: their names ("Lunch · Dinner"), or "2 services"
   * from an older API that sends no service lines. `null` in week view, which lists each service.
   */
  readonly servicesSummary: string | null;
  /** One line per service, first to last bookable time; only populated when `detailed`. */
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
    to: minuteText(service.lastSeatingAt, t, format),
  });
  return { key: service.venueServiceId, text };
}

/**
 * What a calendar cell or agenda row shows for one day, and how it is spoken. With a `service`
 * filter the day reads for that service alone; a day it does not run says so ("No Dinner") unless
 * the whole day is closed anyway.
 */
export function presentDay(
  date: string,
  fullSummary: AvailabilityDaySummary | undefined,
  detailed: boolean,
  t: TFunction,
  format: VenueFormat,
  service?: ServiceFilter | null,
  sectionNames?: ReadonlyMap<string, string>
): DayPresentation {
  const summary = fullSummary && service ? filterDaySummary(fullSummary, service.id) : fullSummary;
  const notRunningName =
    service && fullSummary && fullSummary.serviceCount > 0 && summary?.serviceCount === 0
      ? service.name
      : null;
  const bands = (summary?.closures ?? []).map((c) => closureBandText(c, t, format, sectionNames));
  const services = detailed
    ? (summary?.services ?? []).map((s) => serviceLineText(s, t, format))
    : [];
  // Month names the services, which says more than a count in the same space: a Monday with only
  // Lunch reads apart from a Friday with Lunch · Dinner. Week lists each one, so says neither; an
  // older API that sends no service lines gets the count instead.
  const showCount =
    summary !== undefined &&
    summary.services === undefined &&
    (detailed || summary.serviceCount >= 2);
  const countText = showCount
    ? t("availability.calendar.services", { count: summary.serviceCount })
    : null;
  const monthNames = detailed ? [] : (summary?.services?.map((s) => s.name) ?? []);
  const servicesSummary = countText ?? (monthNames.length > 0 ? monthNames.join(" · ") : null);
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

  const label = notRunningName
    ? t("availability.calendar.serviceNotRunning", { name: notRunningName })
    : summary
      ? dayLabelText(summary.label, t)
      : null;
  const parts = summary
    ? [
        label,
        // Each name its own phrase: a screen reader would read the dot.
        ...(countText ? [countText] : monthNames),
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
    // The service's own en-US labels, as dayLabelText reads them.
    tone:
      notRunningName !== null || summary?.label === "Closed"
        ? "closed"
        : summary?.label === "Special hours"
          ? "special"
          : null,
    bands,
    servicesSummary,
    services,
    onlineOff,
    accessibleDetails,
    accessibleName: t("availability.calendar.cellName", {
      date: fullDate,
      details: accessibleDetails,
    }),
  };
}
