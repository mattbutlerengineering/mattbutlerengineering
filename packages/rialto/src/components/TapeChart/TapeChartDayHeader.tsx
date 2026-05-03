import { memo, type ReactNode } from "react";
import styles from "./TapeChart.module.css";
import { addDays, monthOf } from "./dateMath";
import type { TapeChartLayout } from "./types";
import type { TapeChartFormatters } from "./useTapeChartI18n";
import type { ResolvedStrings } from "./defaultStrings";

export interface TapeChartDayHeaderProps {
  startDate: string;
  dayCount: number;
  formatters: TapeChartFormatters;
  todayISO: string;
  dailyCounts: TapeChartLayout["dailyCounts"];
  strings: ResolvedStrings;
  /** Leading columnheader content (the "Rooms" label) rendered inline for ARIA row compliance. */
  leadingHeader?: ReactNode;
}

export const TapeChartDayHeader = memo(function TapeChartDayHeader(props: TapeChartDayHeaderProps) {
  const { startDate, dayCount, formatters, todayISO, dailyCounts, strings, leadingHeader } = props;

  const cells = [];
  let previousMonth: string | null = null;

  for (let i = 0; i < dayCount; i++) {
    const iso = addDays(startDate, i);
    const isToday = iso === todayISO;
    const month = monthOf(iso);
    const isMonthStart = previousMonth !== null && previousMonth !== month;
    previousMonth = month;

    const counts = dailyCounts[i];
    cells.push(
      <div
        key={iso}
        role="columnheader"
        className={`${styles.dayHeaderCell}${isMonthStart ? " " + styles.dayHeaderMonthDivider : ""}`}
        data-today={isToday ? "true" : undefined}
        aria-current={isToday ? "date" : undefined}
        aria-label={`${formatters.dayLong(iso)}${isToday ? ", " + strings.todayLabel : ""}${
          counts
            ? `, ${counts.arrivals} ${strings.arrivalsLabel.toLowerCase()}, ${counts.departures} ${strings.departuresLabel.toLowerCase()}`
            : ""
        }`}
      >
        <span className={styles.dayHeaderWeekday}>{formatters.dayWeekdayShort(iso)}</span>
        <span className={styles.dayHeaderDate}>{formatters.dayNumeric(iso)}</span>
        {counts && (counts.arrivals > 0 || counts.departures > 0) && (
          <span className={styles.dayCounts} aria-hidden="true">
            {counts.arrivals > 0 && (
              <span className={styles.dayCountPill} data-variant="arrivals">
                {formatters.number(counts.arrivals)}
              </span>
            )}
            {counts.departures > 0 && (
              <span className={styles.dayCountPill} data-variant="departures">
                {formatters.number(counts.departures)}
              </span>
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      role="row"
      className={styles.dayHeader}
      style={{ ["--tapechart-day-count" as string]: dayCount }}
    >
      {leadingHeader}
      {cells}
    </div>
  );
});
