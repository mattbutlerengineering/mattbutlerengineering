import { bookingRulesText } from "../booking-rules.js";
import { scheduleNameText } from "../day-summary.js";
import type { RegularWeekLineService } from "../regular-week-line.js";
import type { ScheduleUsage } from "../rule-summaries.js";
import { serviceCloseChangeText, serviceHoursText } from "../service-hours.js";
import { weekdaySummary } from "../weekday-summary.js";
import { closuresLines } from "./hub-closures-text.js";
import type {
  BookingRulesRow,
  HubRowModels,
  RegularHoursRow,
  SeasonalHoursRow,
} from "./hub-rows.js";
import type { SpecialDatesRow } from "./hub-special-dates.js";
import { shortDate, type HubTextContext } from "./hub-text.js";

/**
 * The hub's five rows in words (availability-hub ux.md, "Hub"): `hubRows` gives the facts, this
 * gives each row its title and its lines. Pure: no React. A row with nothing to list has one line,
 * its empty sentence. Row 4 is worded in `hub-closures-text.ts`.
 */

export interface HubLine {
  readonly text: string;
  /** Row 1 only: the service this line is about, so a Manager's line can open it. */
  readonly venueServiceId?: string;
}

export interface HubRowText {
  readonly row: 1 | 2 | 3 | 4 | 5;
  readonly title: string;
  /** Never empty. */
  readonly lines: readonly HubLine[];
}

const line = (text: string): HubLine => ({ text });

/** One service as the regular-hours line says it, so the hub and that line never disagree. */
function serviceText(service: RegularWeekLineService, ctx: HubTextContext): string {
  const { t, format } = ctx;
  const days = (weekdays: readonly number[]) => weekdaySummary(weekdays, format, t);
  const base = {
    name: service.name,
    hours: serviceHoursText(service, ctx),
    days: days(service.days),
  };
  if (service.changes.length === 0) return t("availability.regularWeekLine.service", base);
  const changes = service.changes
    .map((change) =>
      // Same opening: only the close or last seating moved, so say only that.
      change.opensAt === service.opensAt
        ? serviceCloseChangeText(days(change.weekdays), change, ctx)
        : t("availability.regularWeekLine.different", {
            days: days(change.weekdays),
            hours: serviceHoursText(change, ctx),
          })
    )
    .join(", ");
  return t("availability.regularWeekLine.serviceWith", { ...base, changes });
}

function regularHoursLines(row: RegularHoursRow, ctx: HubTextContext): HubLine[] {
  const { t } = ctx;
  if (row.services.length === 0) return [line(t("availabilityHub.hub.regular.empty"))];
  const services = row.services.map((service) => ({
    text: serviceText(service, ctx),
    venueServiceId: service.venueServiceId,
  }));
  const { upcoming } = row;
  const later = upcoming?.services.map((service) => serviceText(service, ctx)).join(" · ");
  const now = services.map((service) => service.text).join(" · ");
  // A change saved for a later date reads here before it takes over, unless it reads the same.
  if (!upcoming || !later || later === now) return services;
  return [
    ...services,
    line(
      upcoming.endsOn
        ? t("availability.regularWeekLine.upcomingPeriod", {
            from: shortDate(upcoming.startsOn, ctx),
            to: shortDate(upcoming.endsOn, ctx),
            services: later,
          })
        : t("availability.regularWeekLine.upcoming", {
            date: shortDate(upcoming.startsOn, ctx),
            services: later,
          })
    ),
  ];
}

function usageText(usage: ScheduleUsage, ctx: HubTextContext): string {
  const { t, format } = ctx;
  if (usage.kind === "unused") return t("availabilityHub.hub.seasonal.unused");
  if (usage.kind === "rules") {
    return t("availabilityHub.hub.seasonal.byDates", { count: usage.count });
  }
  return usage.periods
    .map((period) => {
      const days = weekdaySummary(period.weekdays, format, t);
      const from = period.startsOn && shortDate(period.startsOn, ctx);
      const to = period.endsOn && shortDate(period.endsOn, ctx);
      if (from && to) return t("availabilityHub.hub.seasonal.range", { from, to, days });
      if (from) return t("availabilityHub.hub.seasonal.from", { from, days });
      if (to) return t("availabilityHub.hub.seasonal.until", { to, days });
      return t("availabilityHub.hub.seasonal.noDates", { days });
    })
    .join("; ");
}

function seasonalHoursLines(row: SeasonalHoursRow, ctx: HubTextContext): HubLine[] {
  const { t } = ctx;
  if (row.sets.length === 0) return [line(t("availabilityHub.hub.seasonal.empty"))];
  return [
    ...row.sets.map((set) =>
      line(
        t("availabilityHub.hub.seasonal.set", {
          name: scheduleNameText(set.name, t),
          usage: usageText(set.usage, ctx),
        })
      )
    ),
    ...(row.more > 0 ? [line(t("availabilityHub.hub.seasonal.more", { count: row.more }))] : []),
  ];
}

function specialDatesLines(row: SpecialDatesRow, ctx: HubTextContext): HubLine[] {
  const { t, format } = ctx;
  const dates = row.next.map((item) =>
    t("availabilityHub.hub.special.item", {
      date: shortDate(item.nextOn, ctx),
      kind: t(`availabilityHub.hub.special.kind.${item.kind}`),
    })
  );
  const holidays =
    row.holidaysNotPlanned > 0
      ? [line(t("availabilityHub.hub.special.holidays", { count: row.holidaysNotPlanned }))]
      : [];
  const first =
    dates.length === 0
      ? t("availabilityHub.hub.special.empty")
      : t("availabilityHub.hub.special.next", {
          dates: new Intl.ListFormat(format.locale, { type: "unit" }).format(dates),
        });
  return [line(first), ...holidays];
}

function bookingRulesLines(row: BookingRulesRow, { t }: HubTextContext): HubLine[] {
  return [
    line(row.rules ? bookingRulesText(row.rules, t) : t("availabilityHub.hub.booking.empty")),
  ];
}

/** The five rows in words, in hub order. `today` is the venue's date. */
export function hubRowTexts(
  rows: HubRowModels,
  today: string,
  ctx: HubTextContext
): readonly HubRowText[] {
  const { t } = ctx;
  const [regular, seasonal, special, closures, booking] = rows;
  return [
    {
      row: 1,
      title: t("availabilityHub.hub.regular.title"),
      lines: regularHoursLines(regular, ctx),
    },
    {
      row: 2,
      title: t("availabilityHub.hub.seasonal.title"),
      lines: seasonalHoursLines(seasonal, ctx),
    },
    {
      row: 3,
      title: t("availabilityHub.hub.special.title"),
      lines: specialDatesLines(special, ctx),
    },
    {
      row: 4,
      title: t("availabilityHub.hub.closures.title"),
      lines: closuresLines(closures, today, ctx).map(line),
    },
    {
      row: 5,
      title: t("availabilityHub.hub.booking.title"),
      lines: bookingRulesLines(booking, ctx),
    },
  ];
}
