import type { TFunction } from "i18next";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { WEEK_DISPLAY_ORDER, effectiveDays, toMinutes } from "./quick-setup-draft.js";
import type { QuickSetupDraft, ServiceDraft } from "./quick-setup-draft.js";
import { weekdaySummary } from "./weekday-summary.js";

export type LineFormat = Pick<VenueFormat, "formatCalendarDate" | "formatLocalTime" | "locale">;

/** What a collapsed service line says (ux.md F2): the name over one summary line. */
export interface ServiceLineText {
  /** The service's name, else "Service N" by position. */
  readonly name: string;
  /** "11:30 AM–3:00 PM · Every day · other hours Fri, Sat"; the parts that are known. */
  readonly summary: string;
  /** The same for a screen reader: "Lunch, 11:30 AM–3:00 PM, Every day". */
  readonly label: string;
}

/**
 * The words of a service's collapsed line: name, hours (with "(next day)" when it closes past
 * midnight), the days it runs on (the shared days, or its own), and the days of its different
 * hours. Parts the Manager has not filled in yet are left out, not guessed.
 */
export function serviceLineText(
  service: ServiceDraft,
  draft: QuickSetupDraft,
  format: LineFormat,
  t: TFunction
): ServiceLineText {
  const index = draft.services.findIndex((s) => s.id === service.id);
  const name =
    service.name.trim() || t("availability.quickSetup.serviceN", { n: Math.max(index, 0) + 1 });
  const parts: string[] = [];
  if (service.opens !== null && service.closes !== null) {
    const wraps = toMinutes(service.closes) <= toMinutes(service.opens);
    const range = `${format.formatLocalTime(service.opens)}–${format.formatLocalTime(service.closes)}`;
    parts.push(wraps ? `${range} ${t("availability.quickSetup.line.nextDay")}` : range);
  }
  // The form's own "Every day" reads as a sentence start; the shared summary's reads mid-sentence.
  const dayText = (list: readonly number[]) =>
    list.length === 7
      ? t("availability.quickSetup.shortcuts.everyDay")
      : weekdaySummary(list, format, t);
  const days = effectiveDays(draft, service);
  if (days.length > 0) parts.push(dayText(days));
  const otherDays = WEEK_DISPLAY_ORDER.filter((day) =>
    service.blocks.some((block) => block.days.includes(day))
  );
  if (otherDays.length > 0) {
    parts.push(t("availability.quickSetup.line.otherHours", { days: dayText(otherDays) }));
  }
  return {
    name,
    summary: parts.join(" · "),
    // "other hours" is a clause of its own to a screen reader, like the rest.
    label: [name, ...parts].join(", "),
  };
}
