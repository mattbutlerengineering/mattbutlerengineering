import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Heading, Text, useToast } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { upcomingHolidays } from "./holidays.js";
import { readOpenAsUsual, useHolidayCountry, writeOpenAsUsual } from "./use-holidays.js";
import type { PlannedDate } from "./AddSpecialDatesSheet.js";
import styles from "./SpecialDatesTab.module.css";

export interface UpcomingHolidaysProps {
  readonly venueId: string;
  readonly config: AvailabilityConfig;
  /** Today on the venue clock. */
  readonly today: string;
  /** Opens Add special date with one Closed row per holiday; each row can become special hours. */
  readonly onPlan: (rows: readonly PlannedDate[]) => void;
}

/**
 * Special dates: the holidays coming up that no date rule covers yet, each one click from Add
 * special date, so a Manager plans Thanksgiving before the first booking for it lands. Planned
 * dates drop out, and so do the ones marked **Open as usual**. Nothing renders for a country the
 * holiday calendar does not know. Mount it keyed by venue: the marks are read once per venue.
 */
export function UpcomingHolidays({ venueId, config, today, onPlan }: UpcomingHolidaysProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const headingId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const country = useHolidayCountry();
  const [openAsUsual, setOpenAsUsual] = useState(() => readOpenAsUsual(venueId));
  const holidays = useMemo(
    () =>
      (country ? upcomingHolidays(country, today, config) : [])
        .filter((h) => !openAsUsual.includes(h.date))
        .map((h) => ({ ...h, name: t(`availabilitySpecial.holidays.name.${h.id}`) })),
    [country, today, config, openAsUsual, t]
  );

  const mark = (next: readonly string[]) => {
    // Past dates are dropped as they go, so the list never grows past a season.
    const kept = next.filter((d) => d >= today);
    writeOpenAsUsual(venueId, kept);
    setOpenAsUsual(kept);
  };
  const keepUsualHours = (holiday: PlannedDate) => {
    mark([...openAsUsual, holiday.date]);
    // The row is gone; the panel keeps focus rather than dropping it to the page.
    sectionRef.current?.focus();
    toast({
      title: t("availabilitySpecial.holidays.openAsUsualToast", { name: holiday.name }),
      action: {
        label: t("availability.undo.action"),
        onClick: () => mark(readOpenAsUsual(venueId).filter((d) => d !== holiday.date)),
      },
    });
  };

  if (holidays.length === 0) return null;

  return (
    <section ref={sectionRef} tabIndex={-1} className={styles.holidays} aria-labelledby={headingId}>
      <div className={styles.holidaysHead}>
        {/* Level 2: the page's h1 is the last heading above it (axe heading-order). */}
        <Heading level={2} size={6} id={headingId}>
          {t("availabilitySpecial.holidays.heading")}
        </Heading>
        {holidays.length > 1 && (
          <Button variant="secondary" size="sm" onClick={() => onPlan(holidays)}>
            {t("availabilitySpecial.holidays.planAll", { count: holidays.length })}
          </Button>
        )}
      </div>
      <ul className={styles.list}>
        {holidays.map((holiday) => {
          const { name } = holiday;
          const date = format.formatCalendarDate(holiday.date, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          return (
            <li key={`${holiday.id}-${holiday.date}`} className={styles.holiday}>
              <Text variant="body">{name}</Text>
              <Text variant="caption" color="secondary">
                {date}
              </Text>
              <div className={styles.holidayActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("availabilitySpecial.holidays.openAsUsualName", { name, date })}
                  onClick={() => keepUsualHours(holiday)}
                >
                  {t("availabilitySpecial.holidays.openAsUsual")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("availabilitySpecial.holidays.planName", { name, date })}
                  onClick={() => onPlan([holiday])}
                >
                  {t("availabilitySpecial.holidays.plan")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
