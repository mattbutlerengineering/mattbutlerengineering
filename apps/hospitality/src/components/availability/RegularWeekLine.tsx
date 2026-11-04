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
import { regularWeekLine } from "./regular-week-line.js";
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

  const text = line.services
    .map((service) => {
      const days = summarize(service.days);
      if (service.changes.length === 0)
        return t("availability.regularWeekLine.service", { name: service.name, days });
      const changes = service.changes
        .map((c) => t(`availability.regularWeekLine.${c.kind}`, { days: summarize(c.weekdays) }))
        .join(", ");
      return t("availability.regularWeekLine.serviceWith", { name: service.name, days, changes });
    })
    .join(" · ");

  return (
    <div className={styles.line}>
      <div className={styles.head}>
        <Text variant="caption" color="secondary">
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
