import type { Reservation, TableDisplayStatus } from "@mbe/types";
import { RESERVED_SOON_WINDOW_MINUTES } from "@mbe/types";
import type { RehearsalEvent } from "./types.js";

export interface RehearsalWaiting {
  reservationId: string;
  partySize: number;
  /** Minutes since midnight at which the walk-in started waiting. */
  since: number;
}

export interface RehearsalMetrics {
  coversServed: number;
  averageTurnMinutes: number;
  /** Hour of day with the most seatings so far, or null before anyone sat. */
  peakHour: number | null;
  /** Of `tableIds` (or every table in the events), those no party has sat at yet. */
  tablesNeverSat: number;
  longestWalkInWaitMinutes: number;
}

export interface RehearsalState {
  reservations: Reservation[];
  tableStatuses: ReadonlyMap<string, TableDisplayStatus>;
  seatedIds: ReadonlySet<string>;
  waiting: RehearsalWaiting[];
  metrics: RehearsalMetrics;
}

export interface RehearsalStateOptions {
  /** Service day (YYYY-MM-DD) stamped on the synthesized reservations. */
  date?: string;
  /** Every table in the room, so `tablesNeverSat` can count tables no event mentions. */
  tableIds?: readonly string[];
}

const DEFAULT_DATE = "1970-01-01";
const DEFAULT_STAY_MINUTES = 90;

const STATUS_FOR_TABLE_EVENT = {
  OCCUPIED: "seated",
  DIRTY: "needs-bussing",
  READY: "available",
  AVAILABLE: "available",
} as const satisfies Record<string, TableDisplayStatus>;

function isoAt(date: string, minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00.000Z`;
}

function makeReservation(
  id: string,
  date: string,
  startMinutes: number,
  partySize: number,
  tableId: string
): Reservation {
  return {
    id,
    date,
    startTime: isoAt(date, startMinutes),
    endTime: isoAt(date, startMinutes + DEFAULT_STAY_MINUTES),
    partySize,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: null,
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId,
    venueId: null,
    createdAt: isoAt(date, startMinutes),
    updatedAt: isoAt(date, startMinutes),
  };
}

/**
 * Folds a rehearsal event log into what the timeline and floor plan would show at `t`
 * (minutes since midnight). Pure: reads `events`, never mutates them.
 */
export function rehearsalStateAt(
  events: readonly RehearsalEvent[],
  t: number,
  { date = DEFAULT_DATE, tableIds }: RehearsalStateOptions = {}
): RehearsalState {
  const reservations = new Map<string, Reservation>();
  const tableBase = new Map<string, TableDisplayStatus>();
  const pendingArrival = new Map<string, { tableId: string; arrivesAt: number }>();
  const seatedAt = new Map<string, number>();
  const seatedIds = new Set<string>();
  const waitingSince = new Map<string, RehearsalWaiting>();
  const seatHours = new Map<string, number>();
  const tablesSat = new Set<string>();
  const seenTables = new Set<string>();
  const turns: number[] = [];
  let coversServed = 0;
  let longestWait = 0;

  const setStatus = (id: string, status: Reservation["status"]) => {
    const r = reservations.get(id);
    if (r) reservations.set(id, { ...r, status });
  };

  for (const e of events) {
    if (e.at > t) break;
    if ("tableId" in e) seenTables.add(e.tableId);
    switch (e.type) {
      case "booked":
        reservations.set(
          e.reservationId,
          makeReservation(e.reservationId, date, e.arrivesAt, e.partySize, e.tableId)
        );
        pendingArrival.set(e.reservationId, { tableId: e.tableId, arrivesAt: e.arrivesAt });
        break;
      case "walk-in-waiting":
        waitingSince.set(e.reservationId, {
          reservationId: e.reservationId,
          partySize: e.partySize,
          since: e.at,
        });
        break;
      case "seated": {
        const wait = waitingSince.get(e.reservationId);
        if (wait) longestWait = Math.max(longestWait, e.at - wait.since);
        waitingSince.delete(e.reservationId);
        pendingArrival.delete(e.reservationId);
        if (!reservations.has(e.reservationId)) {
          reservations.set(
            e.reservationId,
            makeReservation(e.reservationId, date, e.at, e.partySize, e.tableId)
          );
        }
        seatedIds.add(e.reservationId);
        seatedAt.set(e.reservationId, e.at);
        coversServed += e.partySize;
        tablesSat.add(e.tableId);
        const hour = Math.floor(e.at / 60);
        seatHours.set(String(hour), (seatHours.get(String(hour)) ?? 0) + 1);
        break;
      }
      case "status-change":
        tableBase.set(e.tableId, STATUS_FOR_TABLE_EVENT[e.status]);
        break;
      case "no-show":
        pendingArrival.delete(e.reservationId);
        setStatus(e.reservationId, "NO_SHOW");
        break;
      case "departed": {
        seatedIds.delete(e.reservationId);
        setStatus(e.reservationId, "COMPLETED");
        const start = seatedAt.get(e.reservationId);
        if (start !== undefined) turns.push(e.at - start);
        break;
      }
    }
  }

  const tableStatuses = new Map(tableBase);
  for (const { tableId, arrivesAt } of pendingArrival.values()) {
    const base = tableStatuses.get(tableId);
    if (
      (base === undefined || base === "available") &&
      arrivesAt - t <= RESERVED_SOON_WINDOW_MINUTES
    ) {
      tableStatuses.set(tableId, "reserved-soon");
    }
  }

  const waiting = [...waitingSince.values()];
  for (const w of waiting) longestWait = Math.max(longestWait, t - w.since);

  let peakHour: number | null = null;
  let peakCount = 0;
  for (const [hour, count] of seatHours) {
    if (count > peakCount) {
      peakCount = count;
      peakHour = Number(hour);
    }
  }

  const universe = new Set(tableIds ?? seenTables);

  return {
    reservations: [...reservations.values()],
    tableStatuses,
    seatedIds,
    waiting,
    metrics: {
      coversServed,
      averageTurnMinutes: turns.length
        ? Math.round(turns.reduce((a, b) => a + b, 0) / turns.length)
        : 0,
      peakHour,
      tablesNeverSat: [...universe].filter((id) => !tablesSat.has(id)).length,
      longestWalkInWaitMinutes: longestWait,
    },
  };
}
