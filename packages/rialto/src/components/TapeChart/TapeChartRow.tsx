import { memo, useMemo } from "react";
import styles from "./TapeChart.module.css";
import { TapeChartBar } from "./TapeChartBar";
import type { TapeChartPositionedBar, TapeChartReservation, TapeChartRoom } from "./types";
import type { TapeChartFormatters } from "./useTapeChartI18n";
import type { ResolvedStrings } from "./defaultStrings";

export interface TapeChartRowProps {
  room: TapeChartRoom;
  bars: TapeChartPositionedBar[];
  dayCount: number;
  todayOffset: number | null;
  formatters: TapeChartFormatters;
  strings: ResolvedStrings;
  focusedReservationId: string | null;
  selectedReservationId: string | null;
  onSelect: (r: TapeChartReservation) => void;
}

function TapeChartRowImpl(props: TapeChartRowProps) {
  const {
    room,
    bars,
    dayCount,
    todayOffset,
    formatters,
    strings,
    focusedReservationId,
    selectedReservationId,
    onSelect,
  } = props;

  const roomMetaText = useMemo(() => {
    const parts = [];
    if (room.category) parts.push(room.category);
    if (room.capacity) parts.push(strings.partySizeLabel(room.capacity));
    return parts.join(" · ");
  }, [room.category, room.capacity, strings]);

  return (
    <div
      role="row"
      className={styles.row}
      style={{ ["--tapechart-day-count" as string]: dayCount }}
      aria-label={room.name}
    >
      <div role="rowheader" className={styles.roomHeader}>
        <strong>
          {room.status && (
            <span className={styles.roomStatusDot} data-status={room.status} aria-hidden="true" />
          )}
          {room.name}
          {room.status && (
            <span className={styles.srOnly}>
              {" "}
              ({strings.roomStatusLabels[room.status] ?? room.status})
            </span>
          )}
        </strong>
        {roomMetaText && <span className={styles.roomHeaderMeta}>{roomMetaText}</span>}
      </div>

      <div role="gridcell" className={styles.lane}>
        {todayOffset !== null && (
          <div
            className={styles.todayLine}
            style={{ insetInlineStart: `calc(${todayOffset} * var(--tapechart-day-width))` }}
            aria-hidden="true"
          />
        )}
        {bars.map((bar) => (
          <TapeChartBar
            key={bar.reservation.id}
            bar={bar}
            roomName={room.name}
            formatters={formatters}
            strings={strings}
            selected={selectedReservationId === bar.reservation.id}
            tabIndex={focusedReservationId === bar.reservation.id ? 0 : -1}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export const TapeChartRow = memo(TapeChartRowImpl, (prev, next) => {
  return (
    prev.room === next.room &&
    prev.bars === next.bars &&
    prev.dayCount === next.dayCount &&
    prev.todayOffset === next.todayOffset &&
    prev.formatters === next.formatters &&
    prev.strings === next.strings &&
    prev.focusedReservationId === next.focusedReservationId &&
    prev.selectedReservationId === next.selectedReservationId &&
    prev.onSelect === next.onSelect
  );
});
