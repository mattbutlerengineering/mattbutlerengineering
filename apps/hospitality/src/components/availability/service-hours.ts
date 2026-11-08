import type { TFunction } from "i18next";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { minuteText } from "./closure-band.js";

/**
 * One way to say a configured service's times, so the regular-week line, the setup hub, the day
 * summary and the day editor print the same string for the same service (ux.md "Service time
 * rule"). Minutes are service-day minutes, read through `minuteText` (past 24:00 is the next day).
 */

export interface ServiceTimes {
  readonly opensAt: number;
  readonly lastSeatingAt: number;
  readonly closesAt: number;
}

export interface ServiceHoursContext {
  readonly t: TFunction;
  readonly format: VenueFormat;
}

/** "11:30 AM–3:00 PM, last seating 2:00 PM"; the clause is left out when last seating is the close. */
export function serviceHoursText(times: ServiceTimes, { t, format }: ServiceHoursContext): string {
  const range = t("availability.serviceHours.range", {
    open: minuteText(times.opensAt, t, format),
    close: minuteText(times.closesAt, t, format),
  });
  return times.lastSeatingAt === times.closesAt
    ? range
    : t("availability.serviceHours.withLastSeating", {
        range,
        last: minuteText(times.lastSeatingAt, t, format),
      });
}

/**
 * Days where only the closing moved: "Fri, Sat until 12:00 AM, last seating 11:00 PM"
 * (`daysText` is the weekday summary the caller already built).
 */
export function serviceCloseChangeText(
  daysText: string,
  times: Pick<ServiceTimes, "closesAt" | "lastSeatingAt">,
  { t, format }: ServiceHoursContext
): string {
  const close = minuteText(times.closesAt, t, format);
  return times.lastSeatingAt === times.closesAt
    ? t("availability.serviceHours.closeChange", { days: daysText, close })
    : t("availability.serviceHours.closeChangeWithLastSeating", {
        days: daysText,
        close,
        last: minuteText(times.lastSeatingAt, t, format),
      });
}

/** A service's name and its times on one line: "Lunch 11:30 AM–3:00 PM, last seating 2:00 PM". */
export function namedServiceHoursText(
  name: string,
  times: ServiceTimes,
  ctx: ServiceHoursContext
): string {
  return ctx.t("availability.serviceHours.named", { name, hours: serviceHoursText(times, ctx) });
}
