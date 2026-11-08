import type { TFunction } from "i18next";
import type { AvailabilityDaySummary, DaySummaryService } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { filterDaySummary, type ServiceFilter } from "./service-filter.js";
import { closureBandText, isWholeDay, type ClosureBandText } from "./closure-band.js";
import { namedServiceHoursText } from "./service-hours.js";

export interface ServiceLineText {
  readonly key: string;
  /** "Lunch 11:00 AM–3:00 PM, last seating 2:30 PM": the one service-time wording. */
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
  return {
    key: service.venueServiceId,
    text: namedServiceHoursText(service.name, service, { t, format }),
  };
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

/** What sets a month cell apart from the regular week: the most telling difference, and how many more there are. */
export interface DayDifference {
  /** The chip's text, in the viewer's language: "Closed", "Lunch closed", "Weeknights". */
  readonly chip: string;
  /** Further differences the chip does not name ("+1"). */
  readonly more: number;
}

const BOOKING_CHANNELS = ["online", "phone", "waitlist"] as const;

function pausedChannels(
  day: AvailabilityDaySummary
): ReadonlySet<(typeof BOOKING_CHANNELS)[number]> {
  const paused = new Set(BOOKING_CHANNELS.filter((channel) => !day.bookingOpen[channel]));
  for (const closure of day.closures) {
    if (closure.targetKind !== "booking") continue;
    for (const channel of closure.bookingTypes ?? BOOKING_CHANNELS) paused.add(channel);
  }
  return paused;
}

function pausedChip(paused: ReadonlySet<(typeof BOOKING_CHANNELS)[number]>, t: TFunction): string {
  const [only] = [...paused];
  if (paused.size === 1 && only === "online") return t("availability.calendar.chip.onlinePaused");
  if (paused.size === 1 && only === "phone") return t("availability.calendar.chip.phonePaused");
  if (paused.size === 1 && only === "waitlist")
    return t("availability.calendar.chip.waitlistPaused");
  return t("availability.calendar.chip.bookingPaused");
}

/** Every way the day departs from the regular week, in the order the chip ranks them; the first is its chip. */
export function dayDifferences(
  day: AvailabilityDaySummary,
  regularScheduleId: string | null,
  sectionNames: ReadonlyMap<string, string> | undefined,
  t: TFunction,
  serviceNames?: ReadonlyMap<string, string>
): readonly string[] {
  const found: string[] = [];
  const closures = day.closures;
  const wholeDayVenue = closures.some((c) => c.targetKind === "venue" && isWholeDay(c));
  if (day.label === "Closed" || wholeDayVenue)
    found.push(t("availability.calendar.dayLabel.closed"));

  const serviceIds = new Set<string>();
  const serviceChips: string[] = [];
  for (const c of closures) {
    if (c.targetKind !== "service") continue;
    const key = c.venueServiceId ?? "";
    if (serviceIds.has(key)) continue;
    serviceIds.add(key);
    const name =
      day.services?.find((s) => s.venueServiceId === c.venueServiceId)?.name ??
      (c.venueServiceId === undefined ? undefined : serviceNames?.get(c.venueServiceId));
    serviceChips.push(
      name === undefined
        ? t("availability.calendar.chip.serviceClosedUnnamed")
        : t("availability.calendar.chip.serviceClosed", { service: name })
    );
  }
  found.push(...serviceChips);

  const sectionIds = new Set<string>();
  let otherClosure = false;
  for (const c of closures) {
    if (c.targetKind === "venue") {
      if (!isWholeDay(c)) otherClosure = true;
    } else if (c.targetKind === "tables") {
      const section = c.sectionId === undefined ? undefined : sectionNames?.get(c.sectionId);
      if (section === undefined) otherClosure = true;
      else if (!sectionIds.has(c.sectionId ?? "")) {
        sectionIds.add(c.sectionId ?? "");
        found.push(t("availability.calendar.chip.sectionClosed", { section }));
      }
    }
  }

  const paused = pausedChannels(day);
  if (paused.size > 0) found.push(pausedChip(paused, t));

  if (day.label === "Special hours" || otherClosure) {
    found.push(t("availability.calendar.dayLabel.specialHours"));
  }

  // A day from an older API sends no schedule id: it differs only by a name that is not the seeded regular week's.
  const scheduleDiffers =
    day.scheduleId === undefined
      ? scheduleNameText(day.label, t) !== t("availabilitySchedules.regularMarker")
      : day.scheduleId !== null &&
        regularScheduleId !== null &&
        day.scheduleId !== regularScheduleId;
  const namesSchedule = !["Closed", "Special hours", "Open"].includes(day.label);
  if (scheduleDiffers && namesSchedule) found.push(scheduleNameText(day.label, t));
  return found;
}

/**
 * The one chip a month cell shows when its date differs from the regular week (ux.md F5), ranked
 * Closed › {service} closed › {section} closed › booking paused › Special hours › another
 * schedule's name; `null` for a day that reads like the regular week.
 * `serviceNames` names a service a closure closed for good, which the day no longer lists.
 */
export function dayDifference(
  day: AvailabilityDaySummary,
  regularScheduleId: string | null,
  sectionNames: ReadonlyMap<string, string> | undefined,
  t: TFunction,
  serviceNames?: ReadonlyMap<string, string>
): DayDifference | null {
  const [chip, ...rest] = dayDifferences(day, regularScheduleId, sectionNames, t, serviceNames);
  return chip === undefined ? null : { chip, more: rest.length };
}

const LEGEND_SEPARATOR = "   ";

/** Monday-first index of a `YYYY-MM-DD` date's weekday. */
function weekdayIndex(date: string): number {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "Mon–Thu" for a run of consecutive weekdays, "Mon, Wed" otherwise. */
function weekdaysText(dates: readonly string[], format: VenueFormat): string {
  const byIndex = new Map(dates.map((d) => [weekdayIndex(d), d]));
  const indexes = [...byIndex.keys()].sort((a, b) => a - b);
  const name = (index: number) =>
    format.formatCalendarDate(byIndex.get(index) ?? "", { weekday: "short" });
  const first = indexes[0];
  const last = indexes.at(-1);
  if (first === undefined || last === undefined) return "";
  if (indexes.length === 1) return name(first);
  const consecutive = last - first === indexes.length - 1;
  return consecutive ? `${name(first)}–${name(last)}` : indexes.map(name).join(", ");
}

/**
 * The legend above a month grid: each chip in use (a cell's first difference) with the weekdays
 * it falls on when it repeats on the same weekdays in every week it appears in, else with a day
 * count. `cells` are the month's own dates (not the neighbouring months' greyed ones) with all
 * their differences, first = the chip: Christmas Eve's "Lunch closed" does not break the
 * Weeknights pattern its Thursday still belongs to.
 */
export function monthLegend(
  cells: readonly { readonly date: string; readonly differences: readonly string[] }[],
  t: TFunction,
  format: VenueFormat
): string {
  const primary = new Map<string, number>();
  for (const { differences } of cells) {
    const [chip] = differences;
    if (chip !== undefined) primary.set(chip, (primary.get(chip) ?? 0) + 1);
  }
  if (primary.size === 0) return t("availability.calendar.legend.regular");

  const weekKey = (date: string) => {
    const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
    return Math.floor((Date.UTC(y, m - 1, d) / 86_400_000 - weekdayIndex(date)) / 7);
  };
  const entries = [...primary].map(([chip, count]) => {
    const having = cells.filter((c) => c.differences.includes(chip)).map((c) => c.date);
    const weekdays = new Set(having.map(weekdayIndex));
    const weeks = new Set(having.map(weekKey));
    // Weekly: in each week it appears in, every in-month day on those weekdays has it.
    const weekly =
      having.length >= 2 &&
      cells.every(
        ({ date, differences }) =>
          !weeks.has(weekKey(date)) ||
          !weekdays.has(weekdayIndex(date)) ||
          differences.includes(chip)
      );
    return weekly
      ? t("availability.calendar.legend.weekdays", {
          label: chip,
          days: weekdaysText(having, format),
        })
      : t("availability.calendar.legend.days", { label: chip, count });
  });
  return t("availability.calendar.legend.thisMonth", { items: entries.join(LEGEND_SEPARATOR) });
}
