import type { VenueSettings } from "@mbe/types";
import { estimateDuration, filterSuitableTables, type TableFilter } from "./slot-rules.js";

const MS_PER_MINUTE = 60_000;
/** Staff bookings default to PENDING; COMPLETED/CANCELLED/NO_SHOW free the table. */
const OCCUPYING_STATUSES: ReadonlySet<string> = new Set(["PENDING", "CONFIRMED"]);

export type EstimateTable = TableFilter;

export interface EstimateReservation {
  tableId: string;
  startTime: Date;
  endTime: Date;
  status: string;
}

export interface EstimateInput {
  /** 1-based place in the waiting queue. */
  position: number;
  partySize: number;
  now: Date;
  tables: readonly EstimateTable[];
  reservations: readonly EstimateReservation[];
  settings?: VenueSettings | null;
}

/** When one table next frees, in ms from `now`; null if an upcoming booking blocks it. */
function freeInMs(
  tableId: string,
  now: number,
  durationMs: number,
  reservations: readonly EstimateReservation[]
): number | null {
  const own = reservations.filter((r) => r.tableId === tableId && OCCUPYING_STATUSES.has(r.status));
  const blockedByUpcoming = own.some(
    (r) => r.startTime.getTime() > now && r.startTime.getTime() < now + durationMs
  );
  if (blockedByUpcoming) return null;

  const current = own.find((r) => r.startTime.getTime() <= now && r.endTime.getTime() > now);
  return current ? current.endTime.getTime() - now : 0;
}

/**
 * Minutes a waiting party should expect to wait, derived from table turnover:
 * the k-th earliest moment a table that fits the party frees up, cycling by one
 * party-size duration once k passes the table count. Computed from live data on
 * every read - never frozen. Returns null when no table can seat the party.
 */
export function estimateWaitFromTurnover(input: EstimateInput): number | null {
  const { position, partySize, now, tables, reservations, settings } = input;
  const durationMs = estimateDuration(partySize, settings) * MS_PER_MINUTE;

  const freeTimes = filterSuitableTables([...tables], partySize)
    .map((t) => freeInMs(t.id, now.getTime(), durationMs, reservations))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);

  if (freeTimes.length === 0) return null;

  const index = (position - 1) % freeTimes.length;
  const cycles = Math.floor((position - 1) / freeTimes.length);
  const waitMs = (freeTimes[index] ?? 0) + cycles * durationMs;
  return Math.round(waitMs / MS_PER_MINUTE);
}
