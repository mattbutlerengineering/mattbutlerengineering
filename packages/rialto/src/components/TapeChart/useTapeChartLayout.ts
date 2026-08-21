import { useMemo } from "react";
import { addDays, daysBetween } from "./dateMath";
import type {
  TapeChartLayout,
  TapeChartPositionedBar,
  TapeChartReservation,
  TapeChartRoom,
} from "./types";

/**
 * Pack one room's bars into lanes so overlapping reservations don't collide visually.
 * Pure: sorts a copy, never writes to an input bar, and returns fresh bar objects.
 */
function packRoom(bars: TapeChartPositionedBar[]): {
  bars: TapeChartPositionedBar[];
  laneCount: number;
} {
  const sorted = bars.slice().sort((a, b) => a.startOffset - b.startOffset || a.span - b.span);
  const laneEnds: number[] = [];
  const lanes: number[] = [];
  for (const bar of sorted) {
    let placed = false;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i]! <= bar.startOffset) {
        lanes.push(i);
        laneEnds[i] = bar.startOffset + bar.span;
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push(laneEnds.length);
      laneEnds.push(bar.startOffset + bar.span);
    }
  }
  return {
    bars: sorted.map((bar, i) => ({ ...bar, lane: lanes[i]! })),
    laneCount: Math.max(1, laneEnds.length),
  };
}

export function useTapeChartLayout(
  reservations: TapeChartReservation[],
  rooms: TapeChartRoom[],
  startDate: string,
  endDate: string
): TapeChartLayout {
  return useMemo(() => {
    const dayCount = Math.max(0, daysBetween(startDate, endDate));
    const rawByRoom = new Map<string, TapeChartPositionedBar[]>();
    for (const room of rooms) rawByRoom.set(room.id, []);

    const dailyCounts = Array.from({ length: dayCount }, (_, i) => ({
      date: addDays(startDate, i),
      arrivals: 0,
      departures: 0,
      inHouse: 0,
    }));

    for (const reservation of reservations) {
      if (reservation.status === "cancelled" || reservation.status === "noShow") continue;
      const rawStart = daysBetween(startDate, reservation.start);
      const rawEnd = daysBetween(startDate, reservation.end);
      // end-exclusive: a reservation Oct 28→Oct 31 spans Oct 28, 29, 30 (3 nights).
      if (rawEnd <= 0 || rawStart >= dayCount) continue;

      const startOffset = Math.max(0, rawStart);
      const endOffset = Math.min(dayCount, rawEnd);
      const span = Math.max(1, endOffset - startOffset);

      const list = rawByRoom.get(reservation.roomId);
      if (!list) continue;
      list.push({
        reservation,
        startOffset,
        span,
        lane: 0,
        clippedStart: rawStart < 0,
        clippedEnd: rawEnd > dayCount,
      });

      // Daily counts — only count when the arrival/departure lands within view.
      if (rawStart >= 0 && rawStart < dayCount) dailyCounts[rawStart]!.arrivals += 1;
      if (rawEnd > 0 && rawEnd <= dayCount) dailyCounts[rawEnd - 1]!.departures += 1;
      for (let i = startOffset; i < endOffset; i++) {
        dailyCounts[i]!.inHouse += 1;
      }
    }

    const barsByRoom = new Map<string, TapeChartPositionedBar[]>();
    const laneCountByRoom = new Map<string, number>();
    let maxLanes = 1;
    for (const [roomId, raw] of rawByRoom) {
      const packed = packRoom(raw);
      barsByRoom.set(roomId, packed.bars);
      laneCountByRoom.set(roomId, packed.laneCount);
      if (packed.laneCount > maxLanes) maxLanes = packed.laneCount;
    }

    return { barsByRoom, dayCount, laneCountByRoom, maxLanes, dailyCounts };
  }, [reservations, rooms, startDate, endDate]);
}

/** Exposed for consumer SSE reducers. */
export function applyReservationEvent(
  prev: TapeChartReservation[],
  event:
    | { type: "created" | "updated"; reservation: TapeChartReservation }
    | { type: "cancelled"; id: string }
): TapeChartReservation[] {
  if (event.type === "cancelled") {
    return prev.filter((r) => r.id !== event.id);
  }
  const idx = prev.findIndex((r) => r.id === event.reservation.id);
  if (idx === -1) return [...prev, event.reservation];
  const next = prev.slice();
  next[idx] = event.reservation;
  return next;
}
