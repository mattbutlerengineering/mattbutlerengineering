import type { TFunction } from "i18next";
import { addDays, type WeekChange } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { DATE_FORMAT } from "./rule-subjects.js";
import { closureDetail, hoursRange } from "./special-date-detail.js";
import type { SpecialDateRule } from "./special-dates.js";
import type { WeekChangeRow } from "./week-changes-view.js";

export interface WeekChangeTextContext {
  readonly t: TFunction;
  readonly format: VenueFormat;
  readonly config: AvailabilityConfig;
  /** Section names by id, so a section closure reads "Bar closed". */
  readonly sectionNames?: ReadonlyMap<string, string>;
}

/** "Thu, Nov 26", "Thu, Nov 26 to Sat, Nov 28" for a run of days, else each date listed. */
function datesLabel(dates: readonly string[], { t, format }: WeekChangeTextContext): string {
  const label = (d: string) => format.formatCalendarDate(d, DATE_FORMAT);
  const first = dates[0] ?? "";
  const last = dates.at(-1) ?? first;
  if (dates.length <= 1) return label(first);
  if (dates.every((d, i) => d === addDays(first, i))) {
    return t("availabilitySpecial.range", { from: label(first), to: label(last) });
  }
  return new Intl.ListFormat(format.locale, { type: "conjunction" }).format(dates.map(label));
}

const specialRule = (config: AvailabilityConfig, id: string): SpecialDateRule | undefined =>
  config.dateRules.find(
    (r): r is SpecialDateRule => r.id === id && (r.kind === "closure" || r.kind === "special_hours")
  );

const scheduleName = (config: AvailabilityConfig, id: string) =>
  config.schedules.find((s) => s.id === id)?.name ?? "";

/** What changes, without the date: Special dates' own wording for closures and special hours. */
function changeWhat(change: WeekChange, ctx: WeekChangeTextContext): string {
  const { t, format, config } = ctx;
  switch (change.kind) {
    case "closure": {
      const rule = specialRule(config, change.ruleId);
      return rule
        ? closureDetail(rule, format, t, ctx.sectionNames)
        : t("availabilitySpecial.kind.closure");
    }
    case "specialHours": {
      const rule = specialRule(config, change.ruleId);
      const range = rule ? hoursRange(rule, format, t) : null;
      return [t("availabilitySpecial.kind.specialHours"), range].filter(Boolean).join(" · ");
    }
    case "reopen":
      return t("availability.weekChanges.reopens");
    case "seasonalStarts":
      return t("availability.weekChanges.seasonalStarts", {
        name: scheduleName(config, change.scheduleId),
      });
    case "seasonalEnds":
      return t("availability.weekChanges.seasonalEnds", {
        name: scheduleName(config, change.scheduleId),
      });
    case "regularHours":
      return t("availability.weekChanges.regularHours");
  }
}

/** One row's line: "Thu, Nov 26 · Closed", "Thu, Nov 26 · Thanksgiving isn't planned yet". */
export function weekChangeRowText(row: WeekChangeRow, ctx: WeekChangeTextContext): string {
  if ("holiday" in row) {
    const name = ctx.t(`availabilitySpecial.holidays.name.${row.holiday.id}`);
    return `${datesLabel([row.date], ctx)} · ${ctx.t("availability.weekChanges.holiday", { name })}`;
  }
  const dates = "dates" in row.change ? row.change.dates : [row.change.date];
  return `${datesLabel(dates, ctx)} · ${changeWhat(row.change, ctx)}`;
}
