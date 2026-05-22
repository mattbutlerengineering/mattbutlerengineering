import { memo } from "react";
import styles from "./TapeChart.module.css";
import { daysBetween } from "./dateMath";
import type { TapeChartLayout } from "./types";
import type { TapeChartFormatters } from "./useTapeChartI18n";
import type { ResolvedStrings } from "./defaultStrings";

export interface TapeChartStatPillsProps {
  layout: TapeChartLayout;
  todayISO: string;
  startDate: string;
  roomCount: number;
  formatters: TapeChartFormatters;
  strings: ResolvedStrings;
}

export const TapeChartStatPills = memo(function TapeChartStatPills(props: TapeChartStatPillsProps) {
  const { layout, todayISO, startDate, roomCount, formatters, strings } = props;
  const todayOffset = daysBetween(startDate, todayISO);
  const withinView = todayOffset >= 0 && todayOffset < layout.dayCount;
  const todayCounts = withinView ? layout.dailyCounts[todayOffset] : undefined;

  let totalReservations = 0;
  for (const bars of layout.barsByRoom.values()) totalReservations += bars.length;

  return (
    <div className={styles.statPills} role="group" aria-label={strings.regionLabel}>
      <span className={styles.statPill}>
        <strong>{formatters.number(roomCount)}</strong>
        <span>{strings.roomsColumnLabel}</span>
      </span>
      <span className={styles.statPill}>
        <strong>{formatters.number(totalReservations)}</strong>
        <span>{totalReservations === 1 ? "Reservation" : "Reservations"}</span>
      </span>
      {todayCounts && (
        <>
          <span className={styles.statPill} data-variant="arrivals">
            <strong>{formatters.number(todayCounts.arrivals)}</strong>
            <span>{strings.arrivalsLabel}</span>
          </span>
          <span className={styles.statPill} data-variant="departures">
            <strong>{formatters.number(todayCounts.departures)}</strong>
            <span>{strings.departuresLabel}</span>
          </span>
          <span className={styles.statPill}>
            <strong>{formatters.number(todayCounts.inHouse)}</strong>
            <span>{strings.inHouseLabel}</span>
          </span>
        </>
      )}
    </div>
  );
});
