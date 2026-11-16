import type { TFunction } from "i18next";
import type { DateRule } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";

/** When a shown pause ends: with no end, with the service day, or after a later last date. */
export type PauseEnd =
  | { readonly kind: "open" }
  | { readonly kind: "tomorrow" }
  | { readonly kind: "date"; readonly date: string };

/**
 * `shownOnlinePause` only returns a rule that is open-ended or marked and not past its last date,
 * so a last date of today or earlier is the night in progress: it ends tomorrow.
 */
export function pauseEnd(rule: DateRule, today: string): PauseEnd {
  if (rule.endsOn === null || rule.endsOn === undefined) return { kind: "open" };
  return rule.endsOn <= today ? { kind: "tomorrow" } : { kind: "date", date: rule.endsOn };
}

/** "Until tomorrow" / "Until Fri, Nov 20" / "No end date", for the pill and banner. */
export function pauseEndText(
  end: PauseEnd,
  t: TFunction,
  format: Pick<VenueFormat, "formatCalendarDate">
): string {
  if (end.kind === "open") return t("availability.paused.noEndShort");
  if (end.kind === "tomorrow") return t("availability.paused.untilTomorrow");
  const date = format.formatCalendarDate(end.date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return t("availability.paused.untilDate", { date });
}
