import { useMemo, type KeyboardEvent } from "react";
import styles from "./TapeChart.module.css";
import { addDays, daysBetween } from "./dateMath";
import type { TapeChartReservation, TapeChartRoom } from "./types";
import type { TapeChartFormatters } from "./useTapeChartI18n";
import type { ResolvedStrings } from "./defaultStrings";

export interface TapeChartMobileStackProps {
  reservations: TapeChartReservation[];
  rooms: TapeChartRoom[];
  startDate: string;
  endDate: string;
  todayISO: string;
  formatters: TapeChartFormatters;
  strings: ResolvedStrings;
  selectedReservationId: string | null;
  onReservationSelect: (r: TapeChartReservation) => void;
}

export function TapeChartMobileStack(props: TapeChartMobileStackProps) {
  const {
    reservations,
    rooms,
    startDate,
    endDate,
    todayISO,
    formatters,
    strings,
    selectedReservationId,
    onReservationSelect,
  } = props;

  const roomNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(r.id, r.name);
    return m;
  }, [rooms]);

  const byDay = useMemo(() => {
    const count = Math.max(0, daysBetween(startDate, endDate));
    const result: Array<{ iso: string; residents: TapeChartReservation[] }> = [];
    for (let i = 0; i < count; i++) result.push({ iso: addDays(startDate, i), residents: [] });
    for (const r of reservations) {
      if (r.status === "cancelled" || r.status === "noShow") continue;
      const startIdx = daysBetween(startDate, r.start);
      const endIdx = daysBetween(startDate, r.end);
      const from = Math.max(0, startIdx);
      const to = Math.min(count, endIdx);
      for (let i = from; i < to; i++) result[i]!.residents.push(r);
    }
    for (const d of result) {
      d.residents.sort((a, b) => formatters.compare(roomNameById.get(a.roomId) ?? "", roomNameById.get(b.roomId) ?? ""));
    }
    return result;
  }, [reservations, startDate, endDate, formatters, roomNameById]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>, r: TapeChartReservation) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onReservationSelect(r);
    }
  };

  return (
    <div className={styles.mobileStack}>
      {byDay.map((d) => {
        if (!d.residents.length) return null;
        return (
          <article
            key={d.iso}
            className={styles.mobileDayCard}
            data-today={d.iso === todayISO ? "true" : undefined}
            aria-label={formatters.dayLong(d.iso)}
          >
            <header className={styles.mobileDayCardHeader}>
              <span>{formatters.dayLong(d.iso)}</span>
              <span className={styles.listRowMeta}>
                {formatters.number(d.residents.length)}{" "}
                {d.residents.length === 1 ? "reservation" : "reservations"}
              </span>
            </header>
            {d.residents.map((r) => {
              const nights = daysBetween(r.start, r.end);
              const status = strings.statusLabels[r.status] ?? r.status;
              const room = roomNameById.get(r.roomId) ?? r.roomId;
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  className={styles.listRow}
                  data-selected={selectedReservationId === r.id ? "true" : undefined}
                  aria-pressed={selectedReservationId === r.id}
                  aria-label={`${r.guestName ?? "Reservation"}, ${room}, ${formatters.dayLong(r.start)} to ${formatters.dayLong(r.end)}, ${strings.nightsLabel(nights)}, ${status}`}
                  onClick={() => onReservationSelect(r)}
                  onKeyDown={(e) => onKey(e, r)}
                >
                  <div className={styles.listRowGuest}>
                    <span className={styles.listRowGuestName}>{r.guestName ?? r.blockedReason ?? status}</span>
                    <span className={styles.listRowMeta}>
                      {room} · {strings.nightsLabel(nights)}
                    </span>
                  </div>
                  <span />
                  <span className={styles.listRowStatus}>{status}</span>
                </div>
              );
            })}
          </article>
        );
      })}
    </div>
  );
}
