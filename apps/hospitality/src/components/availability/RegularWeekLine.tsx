import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import {
  addDays,
  localDateTimeOf,
  regularWeekView,
  weekdayIndexOf,
  weekSpans,
} from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { minuteText } from "./closure-band.js";
import {
  regularWeekLine,
  upcomingRegularWeek,
  type LineHours,
  type RegularWeekLine as Line,
} from "./regular-week-line.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import { WEEK_DISPLAY_ORDER } from "./quick-setup-draft.js";
import { useWeekdaySummary } from "./ScheduleFormParts.js";
import styles from "./RegularWeekLine.module.css";

/** The party the saved week is read for; with no tables there is nothing to check a party against. */
const PARTY = 2;
const NO_TABLES: never[] = [];

export interface RegularWeekLineProps {
  readonly config: AvailabilityConfig;
  readonly timeZone: string;
  readonly now: Date;
}

/**
 * ux.md F-CAL: the saved regular week as one line under the week summary, with a Details
 * disclosure of the seven weekdays as a guest would book them (the same `weekSpans` the strip
 * and the guest preview read). Read-only, so a Host sees it too. A uniform week has no Details.
 */
export function RegularWeekLine({ config, timeZone, now }: RegularWeekLineProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const summarize = useWeekdaySummary();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const todayDate = localDateTimeOf(now, timeZone).date;
  const line = useMemo(() => regularWeekLine(config, todayDate), [config, todayDate]);
  const upcoming = useMemo(() => upcomingRegularWeek(config, todayDate), [config, todayDate]);

  const rows = useMemo(() => {
    if (!open) return [];
    const today = localDateTimeOf(now, timeZone).date;
    const from = addDays(today, -((weekdayIndexOf(today) + 6) % 7));
    const days = weekSpans(regularWeekView(config), {
      timezone: timeZone,
      from,
      partySize: PARTY,
      tables: NO_TABLES,
      now,
    });
    const names = new Map(config.venueServices.map((vs) => [vs.id, vs.name]));
    const byWeekday = new Map(days.map((d) => [weekdayIndexOf(d.serviceDate), d.services]));
    return WEEK_DISPLAY_ORDER.map((weekday) => ({
      weekday,
      lines: (byWeekday.get(weekday) ?? []).map((s) =>
        t("availability.quickSetup.strip.span", {
          name: names.get(s.venueServiceId) ?? "",
          first: minuteText(s.firstAt, t, format),
          last: minuteText(s.lastAt, t, format),
        })
      ),
    }));
  }, [open, config, timeZone, now, t, format]);

  if (line.services.length === 0) return null;

  const time = (minute: number) => minuteText(minute, t, format);
  const hours = (h: LineHours) =>
    t("availability.regularWeekLine.hours", {
      open: time(h.opensAt),
      close: time(h.lastSeatingAt),
    });
  const describe = (week: Line) =>
    week.services
      .map((service) => {
        const base = { name: service.name, hours: hours(service), days: summarize(service.days) };
        if (service.changes.length === 0) return t("availability.regularWeekLine.service", base);
        const changes = service.changes
          .map((c) => {
            const days = summarize(c.weekdays);
            // Same opening: only the last seating moved, so say only that.
            return c.opensAt === service.opensAt
              ? t("availability.regularWeekLine.closes", { days, close: time(c.lastSeatingAt) })
              : t("availability.regularWeekLine.different", { days, hours: hours(c) });
          })
          .join(", ");
        return t("availability.regularWeekLine.serviceWith", { ...base, changes });
      })
      .join(" · ");
  const text = describe(line);
  // A change saved for a later date reads here before it takes over, unless it reads the same.
  const upcomingText = upcoming && describe(upcoming.line);
  const shortDate = (date: string) =>
    format.formatCalendarDate(date, { month: "short", day: "numeric" });

  return (
    <div className={styles.line}>
      <div className={styles.head}>
        <Text as="span" variant="caption" color="secondary" className={styles.text}>
          {t("availability.regularWeekLine.line", { services: text })}
        </Text>
        {!line.uniform && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((was) => !was)}
          >
            {t("availability.regularWeekLine.details")}
          </Button>
        )}
      </div>
      {upcoming && upcomingText && upcomingText !== text && (
        <Text variant="caption" color="secondary">
          {upcoming.endsOn
            ? t("availability.regularWeekLine.upcomingPeriod", {
                from: shortDate(upcoming.startsOn),
                to: shortDate(upcoming.endsOn),
                services: upcomingText,
              })
            : t("availability.regularWeekLine.upcoming", {
                date: shortDate(upcoming.startsOn),
                services: upcomingText,
              })}
        </Text>
      )}
      {open && !line.uniform && (
        <ul
          id={detailsId}
          className={styles.rows}
          aria-label={t("availability.regularWeekLine.heading")}
        >
          {rows.map((row) => (
            <li key={row.weekday} className={styles.row}>
              <Text variant="label">{dayName(row.weekday)}</Text>
              <Text variant="body">
                {row.lines.length === 0
                  ? t("availability.quickSetup.strip.closed")
                  : row.lines.join(" · ")}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
