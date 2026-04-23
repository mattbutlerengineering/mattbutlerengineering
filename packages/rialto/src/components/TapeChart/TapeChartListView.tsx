import { useMemo, type KeyboardEvent } from "react";
import styles from "./TapeChart.module.css";
import { addDays, daysBetween } from "./dateMath";
import type { TapeChartReservation, TapeChartRoom } from "./types";
import type { TapeChartFormatters } from "./useTapeChartI18n";
import type { ResolvedStrings } from "./defaultStrings";

export interface TapeChartListViewProps {
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

export function TapeChartListView(props: TapeChartListViewProps) {
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

  const days = useMemo(() => {
    const count = Math.max(0, daysBetween(startDate, endDate));
    const out: Array<{ iso: string; arrivals: TapeChartReservation[]; departures: TapeChartReservation[]; inHouse: TapeChartReservation[] }> = [];
    for (let i = 0; i < count; i++) {
      const iso = addDays(startDate, i);
      out.push({ iso, arrivals: [], departures: [], inHouse: [] });
    }
    return out;
  }, [startDate, endDate]);

  const populatedDays = useMemo(() => {
    const next = days.map((d) => ({ ...d, arrivals: [], departures: [], inHouse: [] }) as typeof days[number]);
    for (const r of reservations) {
      if (r.status === "cancelled" || r.status === "noShow") continue;
      const startIdx = daysBetween(startDate, r.start);
      const endIdx = daysBetween(startDate, r.end);
      if (startIdx >= 0 && startIdx < next.length) next[startIdx]!.arrivals.push(r);
      if (endIdx - 1 >= 0 && endIdx - 1 < next.length) next[endIdx - 1]!.departures.push(r);
      const from = Math.max(0, startIdx);
      const to = Math.min(next.length, endIdx);
      for (let i = from; i < to; i++) next[i]!.inHouse.push(r);
    }
    // Sort each group by guest name
    for (const d of next) {
      const cmp = (a: TapeChartReservation, b: TapeChartReservation) =>
        formatters.compare(a.guestName ?? "", b.guestName ?? "");
      d.arrivals.sort(cmp);
      d.departures.sort(cmp);
      d.inHouse.sort(cmp);
    }
    return next;
  }, [days, reservations, startDate, formatters]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>, r: TapeChartReservation) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onReservationSelect(r);
    }
  };

  const renderRow = (r: TapeChartReservation) => {
    const room = roomNameById.get(r.roomId) ?? r.roomId;
    const nights = daysBetween(r.start, r.end);
    const status = strings.statusLabels[r.status] ?? r.status;
    const price = r.ratePerNight != null ? formatters.currency(r.ratePerNight * nights, r.currency) : null;
    return (
      <div
        key={r.id}
        role="button"
        tabIndex={0}
        className={styles.listRow}
        data-selected={selectedReservationId === r.id ? "true" : undefined}
        aria-label={`${r.guestName ?? "Reservation"}, ${room}, ${formatters.dayLong(r.start)} to ${formatters.dayLong(r.end)}, ${strings.nightsLabel(nights)}, ${status}${price ? `, ${price}` : ""}`}
        aria-pressed={selectedReservationId === r.id}
        onClick={() => onReservationSelect(r)}
        onKeyDown={(e) => onKey(e, r)}
      >
        <div className={styles.listRowGuest}>
          <span className={styles.listRowGuestName}>{r.guestName ?? r.blockedReason ?? status}</span>
          <span className={styles.listRowMeta}>
            {room} · {strings.nightsLabel(nights)}
            {r.source ? ` · ${r.source}` : ""}
          </span>
        </div>
        <span />
        <span className={styles.listRowStatus}>
          {status}
          {price && <span> · {price}</span>}
        </span>
      </div>
    );
  };

  return (
    <div className={styles.listView}>
      {populatedDays.map((d) => {
        const anything = d.arrivals.length || d.departures.length || d.inHouse.length;
        if (!anything) return null;
        return (
          <section key={d.iso} className={styles.listSection} aria-label={formatters.dayLong(d.iso)}>
            <header className={styles.listDayHeader} data-today={d.iso === todayISO ? "true" : undefined}>
              <span>{formatters.dayLong(d.iso)}</span>
              <span className={styles.listRowMeta}>
                {strings.arrivalsLabel}: {formatters.number(d.arrivals.length)} ·{" "}
                {strings.departuresLabel}: {formatters.number(d.departures.length)} ·{" "}
                {strings.inHouseLabel}: {formatters.number(d.inHouse.length)}
              </span>
            </header>
            {d.arrivals.map(renderRow)}
            {d.departures.filter((r) => !d.arrivals.includes(r)).map(renderRow)}
          </section>
        );
      })}
    </div>
  );
}
