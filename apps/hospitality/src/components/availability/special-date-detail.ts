import type { TFunction } from "i18next";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { minuteText } from "./closure-band.js";
import { closureKindOf, isOnlinePauseRule } from "./rule-subjects.js";
import type { SpecialDateRule } from "./special-dates.js";

/**
 * How a closure or special-hours rule's detail reads: shared by Special dates and the "Next 7
 * days" list, so a rule is named the same way in both.
 */

/** "11:00 AM – 3:00 PM, 5:00 PM – 10:00 PM": one range per service, so a gap between them shows (ux.md S6b). */
export function hoursRange(
  rule: SpecialDateRule,
  format: VenueFormat,
  t: TFunction
): string | null {
  if (rule.kind !== "special_hours" || rule.payload.services.length === 0) return null;
  return [...rule.payload.services]
    .sort((a, b) => a.opensAt - b.opensAt)
    .map((s) =>
      t("availabilitySpecial.hoursRange", {
        from: minuteText(s.opensAt, t, format),
        to: minuteText(s.closesAt, t, format),
      })
    )
    .join(", ");
}

/**
 * "Closing early · 10:00 PM", "Patio closed · Closing early · 9:00 PM", or "Online booking paused ·
 * From 6:00 PM": what a closure really closes, and from when.
 */
export function closureDetail(
  rule: SpecialDateRule,
  format: VenueFormat,
  t: TFunction,
  sectionNames?: ReadonlyMap<string, string>
): string {
  const closes = closureKindOf(rule, sectionNames);
  const pause = isOnlinePauseRule(rule) || closes.kind === "booking";
  const what = isOnlinePauseRule(rule)
    ? t("availability.paused.banner")
    : closes.kind === "booking"
      ? t("availabilitySpecial.kind.bookingPaused", {
          channels: closes.channels
            .map((c) => t(`availability.close.what.channel.${c}`))
            .join(", "),
        })
      : closes.kind === "section"
        ? t("availabilitySpecial.kind.sectionClosed", { section: closes.section })
        : t("availabilitySpecial.kind.closure");
  if (!rule.window) return what;
  const time = minuteText(rule.window.from, t, format);
  if (pause) return [what, t("availability.close.window.from", { time })].join(" · ");
  const closingEarly = t("availability.close.window.closingEarly", { time });
  // A venue closing early needs no "Closed" before it; a section names itself first.
  return closes.kind === "section" ? [what, closingEarly].join(" · ") : closingEarly;
}
