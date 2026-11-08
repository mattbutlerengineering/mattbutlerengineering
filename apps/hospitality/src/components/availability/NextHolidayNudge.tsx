import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import { addDays } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { useHolidayDecisions } from "../../hooks/useHolidayDecisions.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { holidayStates, HOLIDAY_HORIZON_DAYS } from "./holiday-decisions.js";
import { useHolidayCountry } from "./use-holidays.js";
import styles from "./RegularWeekLine.module.css";

/** Near enough that a Manager who has not planned it should hear about it on the calendar. */
const NUDGE_DAYS = 30;

export interface NextHolidayNudgeProps {
  readonly venueId: string;
  readonly config: AvailabilityConfig;
  /** Today on the venue clock. */
  readonly today: string;
  /** Shows Special dates, where Upcoming holidays plans it. */
  readonly onPlan: () => void;
}

/**
 * Calendar, Managers: the next holiday within a month that nothing has decided yet, with a way to
 * Special dates. A closure, special hours, a rule this flow does not own and an Open as usual all
 * count as decided, for everyone: they come from the venue's own data. The decisions are read
 * through the query Special dates uses, so opening it next costs no second request. While they
 * load or fail it says nothing: it never nags about a holiday it cannot yet know is decided.
 */
export function NextHolidayNudge({ venueId, config, today, onPlan }: NextHolidayNudgeProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const country = useHolidayCountry();
  const decisions = useHolidayDecisions({
    venueId,
    from: today,
    to: addDays(today, HOLIDAY_HORIZON_DAYS),
  });
  const next = useMemo(() => {
    if (!country || !decisions.data) return undefined;
    const last = addDays(today, NUDGE_DAYS);
    return holidayStates(country, today, config, decisions.data).find(
      (h) => h.state.kind === "undecided" && h.date <= last
    );
  }, [country, today, config, decisions.data]);
  if (!next) return null;

  const name = t(`availabilitySpecial.holidays.name.${next.id}`);
  const date = format.formatCalendarDate(next.date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div className={styles.nudge}>
      <Text variant="caption" color="secondary">
        {t("availability.holidayNudge.line", { name, date })}
      </Text>
      <Button variant="ghost" size="sm" onClick={onPlan}>
        {t("availability.holidayNudge.plan")}
      </Button>
    </div>
  );
}
