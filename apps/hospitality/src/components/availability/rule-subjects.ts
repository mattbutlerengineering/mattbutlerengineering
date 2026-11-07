import type { TFunction } from "i18next";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { addDays } from "../../utils/service-day.js";
import type { SpecialDateRule } from "./special-dates.js";

/** What a rule row is called when a dialog names it whole: shared by Special dates and the day drawer. */

export const DATE_FORMAT = { weekday: "short", month: "short", day: "numeric" } as const;

export function rangeLabel(rule: SpecialDateRule, format: VenueFormat, t: TFunction): string {
  const from = format.formatCalendarDate(rule.startsOn, DATE_FORMAT);
  if (rule.endsOn == null) {
    // Hours are not "reopened": an open-ended hours rule just runs from its start on.
    return t(
      rule.kind === "closure" ? "availabilitySpecial.untilReopened" : "availabilitySpecial.fromOn",
      { from }
    );
  }
  if (rule.endsOn === rule.startsOn) return from;
  return t("availabilitySpecial.range", {
    from,
    to: format.formatCalendarDate(rule.endsOn, DATE_FORMAT),
  });
}

/** 2026-01-04 is a Sunday; weekday index n is that date plus n days. */
const SUNDAY = "2026-01-04";

function weekdayList(rule: SpecialDateRule, format: VenueFormat): string {
  const days = (rule.repeat?.weekdays ?? []).map((d) =>
    format.formatCalendarDate(addDays(SUNDAY, d), { weekday: "long" })
  );
  return new Intl.ListFormat(format.locale, { type: "conjunction" }).format(days);
}

/** What removing a special-hours rule takes away, named whole: "for Thu, Dec 31", a range, or a repeat. */
export function hoursSubject(rule: SpecialDateRule, format: VenueFormat, t: TFunction): string {
  if (rule.repeat != null) {
    return t("availabilitySpecial.hours.subjectRepeat", { days: weekdayList(rule, format) });
  }
  return t("availabilitySpecial.hours.subjectDates", { dates: rangeLabel(rule, format, t) });
}

/**
 * What reopening a closure takes away, named whole: one date, the full range, "all dates from
 * Dec 24 on" for an open end, or a repeat by its weekdays and span.
 */
export function closureSubject(rule: SpecialDateRule, format: VenueFormat, t: TFunction): string {
  const from = format.formatCalendarDate(rule.startsOn, DATE_FORMAT);
  const span =
    rule.endsOn == null
      ? t("availabilitySpecial.reopen.fromOn", { from })
      : rule.endsOn === rule.startsOn
        ? from
        : t("availabilitySpecial.range", {
            from,
            to: format.formatCalendarDate(rule.endsOn, DATE_FORMAT),
          });
  if (rule.repeat != null) {
    return t("availabilitySpecial.reopen.subjectRepeat", {
      days: weekdayList(rule, format),
      span,
    });
  }
  return rule.endsOn == null ? t("availabilitySpecial.reopen.subjectOpen", { from }) : span;
}
