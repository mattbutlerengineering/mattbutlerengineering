import type { TFunction } from "i18next";
import type { Layer, LayerSeries, LayerTarget } from "@mbe/availability";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { scheduleNameText } from "./day-summary.js";

/**
 * "Why this day" layers. The engine words `label` and `effect` in en-US and also hands over the
 * facts behind them as data (`Layer`'s optional fields). Each reader renders from the data with
 * catalog keys and the venue's time format; the English is never parsed, and proper names
 * (schedules, services) stay as stored. A layer without the data keeps the engine's words.
 */

const MINUTES_PER_DAY = 1440;

/** A service-day minute as venue wall-clock time; past midnight wraps, as the engine's own text does. */
function clockText(minute: number, format: VenueFormat): string {
  const wrapped = minute % MINUTES_PER_DAY;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return format.formatLocalTime(`${hh}:${mm}`);
}

function upperFirst(text: string, locale: string): string {
  return `${text.charAt(0).toLocaleUpperCase(locale)}${text.slice(1)}`;
}

const BOOKING_TYPE_NAME = {
  online: "availability.drawer.layer.bookingType.online",
  phone: "availability.drawer.layer.bookingType.phone",
  waitlist: "availability.drawer.layer.bookingType.waitlist",
} as const;

const WEEKDAY_NAME = [
  "availability.drawer.layer.weekdays.0",
  "availability.drawer.layer.weekdays.1",
  "availability.drawer.layer.weekdays.2",
  "availability.drawer.layer.weekdays.3",
  "availability.drawer.layer.weekdays.4",
  "availability.drawer.layer.weekdays.5",
  "availability.drawer.layer.weekdays.6",
] as const;

function bookingTypesText(
  types: NonNullable<LayerTarget["bookingTypes"]>,
  t: TFunction,
  locale: string
): string {
  const names = types.map((type) => t(BOOKING_TYPE_NAME[type]));
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
}

function targetText(target: LayerTarget, t: TFunction, format: VenueFormat): string {
  switch (target.kind) {
    case "venue":
      return t("availability.calendar.dayLabel.closed");
    case "service":
      return t("availability.drawer.layer.serviceClosed", {
        name: target.serviceName ?? t("availability.drawer.layer.serviceFallback"),
      });
    case "booking":
      return upperFirst(
        t("availability.drawer.layer.bookingClosed", {
          types: bookingTypesText(target.bookingTypes ?? [], t, format.locale),
        }),
        format.locale
      );
    case "tables":
      return t("availability.drawer.layer.tablesBlocked");
  }
}

function seriesText(series: LayerSeries, t: TFunction, format: VenueFormat): string {
  const days = series.weekdays?.map((d) => t(WEEKDAY_NAME[d] ?? WEEKDAY_NAME[0])).join(", ");
  const range = `${series.startsOn} – ${series.endsOn ?? t("availability.drawer.layer.untilReopened")}`;
  return [targetText(series.target, t, format), days, range].filter(Boolean).join(" · ");
}

function hoursText(hours: NonNullable<Layer["hours"]>, t: TFunction, format: VenueFormat): string {
  return hours.length === 0
    ? t("availability.calendar.dayLabel.closed")
    : hours
        .map((s) =>
          t("availability.drawer.layer.serviceHours", {
            name: s.name,
            from: clockText(s.opensAt, format),
            to: clockText(s.closesAt, format),
          })
        )
        .join(", ");
}

function tonightText(
  tonight: NonNullable<Layer["tonight"]>,
  t: TFunction,
  format: VenueFormat
): string {
  if ("closeAt" in tonight) {
    return t("availability.drawer.layer.closesAt", { time: clockText(tonight.closeAt, format) });
  }
  if ("stop" in tonight) {
    return t("availability.drawer.layer.stopped", {
      from: clockText(tonight.stop.from, format),
      to: clockText(tonight.stop.to, format),
    });
  }
  return t("availability.drawer.layer.pacing", { count: tonight.pacingCovers });
}

/** A layer's title in the viewer's language. */
export function layerLabelText(layer: Layer, t: TFunction, format: VenueFormat): string {
  switch (layer.kind) {
    case "schedule":
      return layer.scheduleName !== undefined
        ? scheduleNameText(layer.scheduleName, t)
        : layer.label;
    case "use_schedule":
      return layer.scheduleName !== undefined
        ? t("availability.drawer.layer.useSchedule", {
            name: scheduleNameText(layer.scheduleName, t),
          })
        : layer.label;
    case "special_hours":
      return t("availability.calendar.dayLabel.specialHours");
    case "skip":
      return layer.skippedFrom
        ? t("availability.drawer.layer.skippedFrom", {
            series: seriesText(layer.skippedFrom, t, format),
          })
        : t("availability.drawer.layer.skippedDate");
    case "closure":
      return layer.target ? targetText(layer.target, t, format) : layer.label;
    case "tonight":
      return t("availability.drawer.layer.tonight");
  }
}

/** What a layer does, in the viewer's language and the venue's time format. */
export function layerEffectText(layer: Layer, t: TFunction, format: VenueFormat): string {
  switch (layer.kind) {
    case "skip":
      return t("availability.drawer.layer.bookableAsUsual");
    case "closure":
      if (!layer.target) return layer.effect;
      return layer.window
        ? t("availability.drawer.layer.window", {
            from: clockText(layer.window.from, format),
            to: clockText(layer.window.to, format),
          })
        : t("availability.drawer.layer.allDay");
    case "tonight":
      return layer.tonight ? tonightText(layer.tonight, t, format) : layer.effect;
    default:
      return layer.hours ? hoursText(layer.hours, t, format) : layer.effect;
  }
}
