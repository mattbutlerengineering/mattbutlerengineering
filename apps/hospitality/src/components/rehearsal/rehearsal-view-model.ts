import type { Reservation, ReservationStatus, TableDisplayStatus } from "@mbe/types";
import { minutesOfDayIn, venueDate } from "../../utils/service-day";
import type { PartyPhase, PartyState, RehearsalState, WaitingParty } from "./rehearsal-state";
import type { TableCycleStatus } from "./simulate-service";

const MS_PER_MINUTE = 60_000;

const reservationId = (seed: number, partyId: string): string =>
  `rehearsal-${seed}-${partyId.replace(/^p/, "")}`;

export interface RehearsalView {
  readonly reservations: Reservation[];
  readonly tableStatuses: ReadonlyMap<string, TableDisplayStatus>;
  readonly seatedIds: ReadonlySet<string>;
  readonly waiting: readonly WaitingParty[];
}

export interface BuildRehearsalViewInput {
  readonly state: RehearsalState;
  readonly seed: number;
  /** Every table of the run, so tables that never appear in an event still read as available. */
  readonly tableIds: readonly string[];
  readonly now: Date;
  readonly timeZone: string;
  /** Localized "Party of N"; the only name a simulated row ever carries. */
  readonly partyName: (size: number) => string;
}

/** The instant of the venue's midnight for the day containing `now`, in epoch ms. */
export function venueMidnightMs(now: Date, timeZone: string): number {
  const wholeMinute = now.getTime() - (now.getTime() % MS_PER_MINUTE);
  return wholeMinute - minutesOfDayIn(now, timeZone) * MS_PER_MINUTE;
}

export function minuteToIso(midnightMs: number, minute: number): string {
  return new Date(midnightMs + minute * MS_PER_MINUTE).toISOString();
}

const RESERVATION_STATUS: Readonly<Record<PartyPhase, ReservationStatus>> = {
  booked: "CONFIRMED",
  seated: "CONFIRMED",
  finished: "COMPLETED",
  "no-show": "NO_SHOW",
};

/**
 * UX amendment (breakdown Notes, 2026-10-19): the shared `TableDisplayStatus` has no 'ready', so a
 * table the simulator calls clean-but-not-yet-seatable shows as available.
 */
const TABLE_STATUS: Readonly<Record<TableCycleStatus, TableDisplayStatus>> = {
  available: "available",
  ready: "available",
  occupied: "seated",
  dirty: "needs-bussing",
};

function toReservation(
  partyId: string,
  party: PartyState,
  input: BuildRehearsalViewInput,
  midnight: number,
  date: string
): Reservation {
  const stamp = minuteToIso(midnight, 0);
  return {
    id: reservationId(input.seed, partyId),
    date,
    startTime: minuteToIso(midnight, party.startAt),
    endTime: minuteToIso(midnight, party.endAt),
    partySize: party.size,
    status: RESERVATION_STATUS[party.phase],
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: input.partyName(party.size),
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: party.tableId,
    venueId: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** The one adapter from the simulator's state to the props the existing views already accept. */
export function buildRehearsalView(input: BuildRehearsalViewInput): RehearsalView {
  const { state, tableIds, now, timeZone } = input;
  const midnight = venueMidnightMs(now, timeZone);
  const date = venueDate(now, timeZone);

  const entries = [...state.parties].sort(
    ([, a], [, b]) => a.startAt - b.startAt || a.tableId.localeCompare(b.tableId)
  );
  const reservations = entries.map(([partyId, party]) =>
    toReservation(partyId, party, input, midnight, date)
  );
  const seatedIds = new Set(
    entries
      .filter(([, party]) => party.phase === "seated")
      .map(([partyId]) => `rehearsal-${input.seed}-${partyId.replace(/^p/, "")}`)
  );
  const tableStatuses = new Map<string, TableDisplayStatus>(
    tableIds.map((id) => [id, TABLE_STATUS[state.tableCycle.get(id) ?? "available"]])
  );
  const waiting = [...state.waiting].sort((a, b) => a.sinceAt - b.sinceAt);
  return { reservations, tableStatuses, seatedIds, waiting };
}
