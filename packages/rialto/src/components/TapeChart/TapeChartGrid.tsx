import { useMemo, type CSSProperties } from "react";
import styles from "./TapeChart.module.css";
import { daysBetween } from "./dateMath";
import { TapeChartDayHeader } from "./TapeChartDayHeader";
import { TapeChartRow } from "./TapeChartRow";
import type { TapeChartLayout, TapeChartReservation, TapeChartRoom } from "./types";
import type { TapeChartFormatters } from "./useTapeChartI18n";
import type { ResolvedStrings } from "./defaultStrings";

export interface TapeChartGridProps {
  rooms: TapeChartRoom[];
  layout: TapeChartLayout;
  startDate: string;
  dayWidth: number;
  todayISO: string;
  formatters: TapeChartFormatters;
  strings: ResolvedStrings;
  focusedReservationId: string | null;
  selectedReservationId: string | null;
  onReservationSelect: (r: TapeChartReservation) => void;
}

export function TapeChartGrid(props: TapeChartGridProps) {
  const {
    rooms,
    layout,
    startDate,
    dayWidth,
    todayISO,
    formatters,
    strings,
    focusedReservationId,
    selectedReservationId,
    onReservationSelect,
  } = props;

  const todayOffset = useMemo(() => {
    const offset = daysBetween(startDate, todayISO);
    return offset >= 0 && offset < layout.dayCount ? offset : null;
  }, [startDate, todayISO, layout.dayCount]);

  const rootStyle: CSSProperties = {
    ["--tapechart-day-width" as string]: `${dayWidth}px`,
    ["--tapechart-day-count" as string]: layout.dayCount,
  };

  return (
    <div className={styles.scroller} style={rootStyle} role="grid" aria-label={strings.regionLabel}>
      {/* Day header — spans full grid width (after the room column) */}
      <div
        className={styles.gridBody}
        style={{ ["--tapechart-day-count" as string]: layout.dayCount }}
        role="rowgroup"
      >
        <TapeChartDayHeader
          startDate={startDate}
          dayCount={layout.dayCount}
          formatters={formatters}
          todayISO={todayISO}
          dailyCounts={layout.dailyCounts}
          strings={strings}
          leadingHeader={
            <div
              role="columnheader"
              className={styles.roomHeader}
              style={{ position: "sticky", insetInlineStart: 0, zIndex: 3 }}
            >
              <strong>{strings.roomsColumnLabel}</strong>
            </div>
          }
        />

        {rooms.map((room) => {
          const bars = layout.barsByRoom.get(room.id) ?? [];
          return (
            <TapeChartRow
              key={room.id}
              room={room}
              bars={bars}
              dayCount={layout.dayCount}
              todayOffset={todayOffset}
              formatters={formatters}
              strings={strings}
              focusedReservationId={focusedReservationId}
              selectedReservationId={selectedReservationId}
              onSelect={onReservationSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
