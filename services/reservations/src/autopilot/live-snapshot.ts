import type { ReservationStatus, TableStatus, WaitlistStatus } from "@mbe/types";
import type {
  NightReservation,
  NightState,
  NightTable,
  NightWaitlistEntry,
  ReservationPhase,
} from "./replay/types.js";

type Instant = Date | string;

/** The fields of a table row the snapshot reads (a subset of `Table`). */
export interface LiveTable {
  id: string;
  name: string;
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
  isActive: boolean;
  status: TableStatus;
}

/** The fields of a reservation row the snapshot reads (a subset of `Reservation`). */
export interface LiveReservation {
  id: string;
  status: ReservationStatus;
  tableId: string;
  partySize: number;
  startTime: Instant;
  endTime: Instant;
  guestName: string | null;
}

/** The fields of a waitlist row the snapshot reads (a subset of `WaitlistEntry`). */
export interface LiveWaitlistEntry {
  id: string;
  status: WaitlistStatus;
  partySize: number;
  guestName: string;
  createdAt: Instant;
}

export interface LiveSnapshotInput {
  now: Instant;
  tables: readonly LiveTable[];
  /** Today's reservations for the venue. */
  reservations: readonly LiveReservation[];
  waitlist: readonly LiveWaitlistEntry[];
  /** Reservations the host has marked arrived. The database has no arrival state, so this comes from the host stand. */
  arrivedReservationIds?: readonly string[];
}

/** What `proposeMoves(state, at)` takes. `at` is 0: the clock is "minutes from now", so `joinedAt` is minus the wait. */
export interface LiveSnapshot {
  at: number;
  state: NightState;
}

const MS_PER_MINUTE = 60_000;
const DONE_STATUSES: ReadonlySet<ReservationStatus> = new Set([
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

const toMs = (t: Instant): number => (t instanceof Date ? t.getTime() : Date.parse(t));

/**
 * Real data has no "arrived" or "seated" column. A reservation is `seated` when its table is
 * OCCUPIED and its start time has passed (conservative: an overstaying party and a later
 * booking on the same table both read as seated, so neither is ever proposed for a move).
 */
function phaseOf(
  r: LiveReservation,
  table: LiveTable | undefined,
  nowMs: number,
  arrived: ReadonlySet<string>
): ReservationPhase {
  if (DONE_STATUSES.has(r.status)) return "done";
  if (table?.status === "OCCUPIED" && toMs(r.startTime) <= nowMs) return "seated";
  return arrived.has(r.id) ? "arrived" : "booked";
}

function mapWaitlist(entries: readonly LiveWaitlistEntry[], nowMs: number): NightWaitlistEntry[] {
  const out: NightWaitlistEntry[] = [];
  for (const w of entries) {
    // expired and cancelled parties are gone; notified ones already hold an offer.
    if (w.status === "expired" || w.status === "cancelled") continue;
    const waited = Math.max(0, Math.floor((nowMs - toMs(w.createdAt)) / MS_PER_MINUTE));
    out.push({
      id: w.id,
      partySize: w.partySize,
      status: w.status === "waiting" ? "waiting" : "seated",
      joinedAt: -waited,
      label: w.guestName,
    });
  }
  return out;
}

/** Pure adapter from live rows to the engine's input. No I/O; the caller reads the rows via the existing services. */
export function buildLiveSnapshot(input: LiveSnapshotInput): LiveSnapshot {
  const nowMs = toMs(input.now);
  const arrived = new Set(input.arrivedReservationIds ?? []);
  const byId = new Map(input.tables.map((t) => [t.id, t]));
  const tables: NightTable[] = input.tables.map((t) => ({
    id: t.id,
    name: t.name,
    capacity: t.capacity,
    minCovers: t.minCovers,
    maxCovers: t.maxCovers,
    isActive: t.isActive,
    status: t.status,
  }));
  const reservations: NightReservation[] = input.reservations.map((r) => ({
    id: r.id,
    partySize: r.partySize,
    tableId: r.tableId,
    phase: phaseOf(r, byId.get(r.tableId), nowMs, arrived),
    ...(r.guestName ? { label: r.guestName } : {}),
  }));
  return { at: 0, state: { tables, reservations, waitlist: mapWaitlist(input.waitlist, nowMs) } };
}
