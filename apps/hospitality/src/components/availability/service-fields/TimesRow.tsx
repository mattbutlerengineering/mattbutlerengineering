import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, TimePicker } from "@mattbutlerengineering/rialto";
import { addDays } from "@mbe/availability";
import { useVenueFormat } from "../../../hooks/useVenueFormat.js";
import { clockHour } from "../../../utils/clock-hour.js";
import { setServiceTime, type LinkedTimes, type TimeField } from "./service-times.js";
import styles from "./ServiceFields.module.css";

const TIME_FIELDS = ["opens", "lastSeating", "closes"] as const;

/** What is wrong with each time, already worded by the form that validated it. */
export type TimeProblems = Partial<Record<TimeField, ReactNode>>;

/** The DOM id of one field, so the form that owns the row can move focus to it. */
export function serviceFieldId(idScope: string, field: TimeField | "seating" | "bookedBy") {
  return `${idScope}-${field}`;
}

export interface TimesRowProps<T extends LinkedTimes> {
  readonly times: T;
  readonly onChange: (next: T) => void;
  /** Prefix of the three field ids ({@link serviceFieldId}); unique per row on the page. */
  readonly idScope: string;
  readonly problems?: TimeProblems;
  /** The one date these hours are for: the overnight hint then names the weekday it closes on. */
  readonly date?: string;
}

/** Opens, last seating and closes, with the hint for a close that falls on the next day. */
export function TimesRow<T extends LinkedTimes>({
  times,
  onChange,
  idScope,
  problems,
  date,
}: TimesRowProps<T>) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { opens, closes } = times;
  const overnight =
    opens !== null && closes !== null && closes < opens
      ? { time: format.formatLocalTime(closes), count: clockHour(Number.parseInt(closes, 10) * 60) }
      : null;
  return (
    <>
      <div className={styles.times}>
        {TIME_FIELDS.map((field) => (
          <div key={field} className={styles.timeField}>
            <TimePicker
              id={serviceFieldId(idScope, field)}
              label={t(`availability.quickSetup.${field}`)}
              value={times[field]}
              onChange={(value) => onChange(setServiceTime(times, field, value))}
            />
            {problems?.[field]}
          </div>
        ))}
      </div>
      {overnight && (
        <Text variant="caption" color="secondary">
          {date
            ? t("availability.editor.overnight", {
                ...overnight,
                weekday: format.formatCalendarDate(addDays(date, 1), { weekday: "long" }),
              })
            : t("availability.editor.overnightNextDay", overnight)}
        </Text>
      )}
    </>
  );
}
