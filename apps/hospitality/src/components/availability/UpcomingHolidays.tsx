import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Heading, Text } from "@mattbutlerengineering/rialto";
import { toPublicVenueProfile, type AvailabilityConfig } from "@mbe/types";
import { useOptionalVenue } from "../../contexts/venue-context-object.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { holidayCountry, upcomingHolidays } from "./holidays.js";
import type { PlannedDate } from "./AddSpecialDatesSheet.js";
import styles from "./SpecialDatesTab.module.css";

export interface UpcomingHolidaysProps {
  readonly config: AvailabilityConfig;
  /** Today on the venue clock. */
  readonly today: string;
  /** Opens Add special date with one Closed row per holiday; each row can become special hours. */
  readonly onPlan: (rows: readonly PlannedDate[]) => void;
}

/**
 * Special dates: the holidays coming up that no date rule covers yet, each one click from Add
 * special date, so a Manager plans Thanksgiving before the first booking for it lands. Planned
 * dates drop out. Nothing renders for a country the holiday calendar does not know.
 */
export function UpcomingHolidays({ config, today, onPlan }: UpcomingHolidaysProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const headingId = useId();
  const venue = useOptionalVenue()?.selectedVenue;
  const country = holidayCountry(
    toPublicVenueProfile(venue?.settings?.["profile"]).address?.country,
    format.locale
  );
  const holidays = useMemo(
    () =>
      (country ? upcomingHolidays(country, today, config) : []).map((h) => ({
        ...h,
        name: t(`availabilitySpecial.holidays.name.${h.id}`),
      })),
    [country, today, config, t]
  );
  if (holidays.length === 0) return null;

  return (
    <section className={styles.holidays} aria-labelledby={headingId}>
      <div className={styles.holidaysHead}>
        <Heading level={3} size={6} id={headingId}>
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
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("availabilitySpecial.holidays.planName", { name, date })}
                onClick={() => onPlan([holiday])}
              >
                {t("availabilitySpecial.holidays.plan")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
