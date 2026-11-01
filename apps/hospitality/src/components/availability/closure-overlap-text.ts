import type { TFunction } from "i18next";
import type { ClosedByRule, ClosureOverlap, VenueService } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { addDays } from "../../utils/service-day.js";
import { minuteText } from "./closure-band.js";

const DATE_FORMAT = { weekday: "short", month: "short", day: "numeric" } as const;
/** 2026-01-04 is a Sunday; weekday index n is that date plus n days. */
const SUNDAY = "2026-01-04";
const DATES_NAMED = 3;
const SEPARATOR = " · ";

function targetText(by: ClosedByRule, services: readonly VenueService[], t: TFunction): string {
  switch (by.targetKind) {
    case "venue":
      return t("availability.close.what.venue");
    case "service":
      return (
        services.find((s) => s.id === by.venueServiceId)?.name ??
        t("availability.closureOverlap.service")
      );
    case "booking":
      return t("availability.closureOverlap.booking", {
        channels: (by.bookingTypes ?? [])
          .map((c) => t(`availability.close.what.channel.${c}`))
          .join(", "),
      });
    default:
      return t("availability.closureOverlap.tables");
  }
}

/** Nothing for one date: the sentence around it names that date already. */
function spanText(by: ClosedByRule, t: TFunction, format: VenueFormat): string | null {
  const date = (d: string) => format.formatCalendarDate(d, DATE_FORMAT);
  const from = date(by.startsOn);
  const span =
    by.endsOn == null
      ? t("availabilitySpecial.untilReopened", { from })
      : by.endsOn === by.startsOn
        ? null
        : t("availabilitySpecial.range", { from, to: date(by.endsOn) });
  if (by.repeat == null) return span;
  const days = by.repeat.weekdays.map((d) =>
    format.formatCalendarDate(addDays(SUNDAY, d), { weekday: "long" })
  );
  return t("availabilitySpecial.reopen.subjectRepeat", {
    days: new Intl.ListFormat(format.locale, { type: "conjunction" }).format(days),
    span: span ?? from,
  });
}

/** The closure in words: "Whole venue · From 6:00 PM · Thu, Dec 24 to Sat, Dec 26". */
function closureText(
  by: ClosedByRule,
  services: readonly VenueService[],
  t: TFunction,
  format: VenueFormat
): string {
  const from = by.window
    ? t("availability.close.window.from", { time: minuteText(by.window.from, t, format) })
    : null;
  return [targetText(by, services, t), from, spanText(by, t, format)]
    .filter((part) => part !== null)
    .join(SEPARATOR);
}

/** Up to three dates by name, the rest as a count: a closure of a year must not read as a list. */
function datesText(dates: readonly string[], t: TFunction, format: VenueFormat): string {
  const named = dates.slice(0, DATES_NAMED).map((d) => format.formatCalendarDate(d, DATE_FORMAT));
  const rest = dates.length - named.length;
  return rest === 0
    ? new Intl.ListFormat(format.locale, { type: "conjunction" }).format(named)
    : t("availability.closureOverlap.moreDates", { dates: named.join(", "), count: rest });
}

/** One sentence per closure, saying which dates it closes and naming it. */
export function overlapLines(
  overlap: ClosureOverlap,
  kind: "already" | "stays",
  services: readonly VenueService[],
  t: TFunction,
  format: VenueFormat
): readonly string[] {
  return overlap.by.map((by) =>
    t(`availability.closureOverlap.${kind}`, {
      dates: datesText(by.dates, t, format),
      closure: closureText(by, services, t, format),
    })
  );
}
