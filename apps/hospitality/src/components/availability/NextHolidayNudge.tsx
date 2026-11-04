import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import { addDays } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { upcomingHolidays } from "./holidays.js";
import { readOpenAsUsual, useHolidayCountry } from "./use-holidays.js";
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
 * Calendar, Managers: the next holiday within a month that no date rule covers and that is not
 * marked Open as usual, with a way to Special dates. The calendar names holidays already; this says
 * the nearest one has not been decided.
 */
export function NextHolidayNudge({ venueId, config, today, onPlan }: NextHolidayNudgeProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const country = useHolidayCountry();
  const next = useMemo(() => {
    if (!country) return undefined;
    const openAsUsual = readOpenAsUsual(venueId);
    const last = addDays(today, NUDGE_DAYS);
    return upcomingHolidays(country, today, config).find(
      (h) => h.date <= last && !openAsUsual.includes(h.date)
    );
  }, [country, venueId, today, config]);
  if (!next) return null;

  const name = t(`availabilitySpecial.holidays.name.${next.id}`);
  const date = format.formatCalendarDate(next.date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div className={styles.head}>
      <Text variant="caption" color="secondary">
        {t("availability.holidayNudge.line", { name, date })}
      </Text>
      <Button variant="ghost" size="sm" onClick={onPlan}>
        {t("availability.holidayNudge.plan")}
      </Button>
    </div>
  );
}
