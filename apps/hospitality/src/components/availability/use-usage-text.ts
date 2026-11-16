import { useTranslation } from "react-i18next";
import type { AvailabilityConfig, Schedule } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { scheduleUsage } from "./rule-summaries.js";
import { useWeekdaySummary } from "./ScheduleFormParts.js";

/**
 * Where a schedule applies, in words: "Mon–Thu", "Jun 1 – Sep 15, every day", the Use schedule
 * rules that point at it, or none yet. The Seasonal hours list and the Schedules tab say it alike.
 */
export function useUsageText(config: AvailabilityConfig) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const summary = useWeekdaySummary();
  const day = (date: string) => format.formatCalendarDate(date, { month: "short", day: "numeric" });
  return (schedule: Pick<Schedule, "id">): string => {
    const usage = scheduleUsage(config, schedule.id);
    if (usage.kind === "unused") return t("availabilitySchedules.notUsed");
    if (usage.kind === "rules")
      return t("availabilitySchedules.usedByRules", { count: usage.count });
    return usage.periods
      .map((a) => {
        const days = summary(a.weekdays);
        if (a.startsOn && a.endsOn)
          return t("availabilitySchedules.usageRange", {
            from: day(a.startsOn),
            to: day(a.endsOn),
            days,
          });
        if (a.startsOn)
          return t("availabilitySchedules.usageFrom", { from: day(a.startsOn), days });
        if (a.endsOn) return t("availabilitySchedules.usageUntil", { to: day(a.endsOn), days });
        return days;
      })
      .join("; ");
  };
}
