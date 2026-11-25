import type { Reservation, Table, TableStatus, WaitlistEntry } from "@mbe/types";

/** A table as the harness sees it: only the fields the seating rules read. */
export type NightTable = Pick<Table, "id" | "capacity" | "minCovers" | "maxCovers" | "isActive"> & {
  status: TableStatus;
  /** Display name for proposal reasons; the id is used when absent. */
  name?: string;
};

/**
 * Where a booked party is in tonight's flow. `seated` means they occupy `tableId`.
 * Mapping to the real `ReservationStatus` + table status: docs/autopilot-night-replay.md.
 */
export type ReservationPhase = "booked" | "arrived" | "seated" | "done";

export type NightReservation = Pick<Reservation, "id" | "partySize" | "tableId"> & {
  phase: ReservationPhase;
  /** Display label for proposal reasons (for example "the Garcias"). */
  label?: string;
};

export type NightWaitlistEntry = Pick<WaitlistEntry, "id" | "partySize"> & {
  status: "waiting" | "seated";
  /** Minutes on the night's clock when the party joined; absent means "since doors opened" (0). */
  joinedAt?: number;
  /** Display label for proposal reasons (for example "the Garcias"). */
  label?: string;
};

/** Snapshot of the floor at one instant. Never mutated; each event yields a new one. */
export interface NightState {
  tables: readonly NightTable[];
  reservations: readonly NightReservation[];
  waitlist: readonly NightWaitlistEntry[];
}

/** Events a night is made of. `at` is minutes since doors opened and must be non-decreasing. */
export type NightEvent =
  | { at: number; type: "reservation_arrived"; reservationId: string }
  | { at: number; type: "reservation_seated"; reservationId: string; tableId: string }
  | { at: number; type: "reservation_completed"; reservationId: string }
  | { at: number; type: "table_status"; tableId: string; status: TableStatus }
  | { at: number; type: "waitlist_joined"; entry: NightWaitlistEntry };

/** A move the proposer wants to put in front of the host. */
export type Suggestion =
  | { kind: "reseat"; reservationId: string; toTableId: string }
  | { kind: "waitlist_offer"; entryId: string; tableId: string };

/** What a proposer sees after each event is applied. */
export interface ProposerInput {
  nightId: string;
  at: number;
  event: NightEvent;
  state: NightState;
}

/** The seam #9491 plugs into. Must be deterministic unless explicitly flagged model-backed. */
export interface Proposer {
  name: string;
  propose(input: ProposerInput): readonly Suggestion[];
}

/** A move that is correct if suggested while `windowStart <= at <= windowEnd`. */
export interface GoodMove {
  suggestion: Suggestion;
  windowStart: number;
  windowEnd: number;
}

export interface Night {
  id: string;
  description: string;
  initial: NightState;
  events: readonly NightEvent[];
  /** Empty means "no move is correct" (every suggestion is noise). */
  goodMoves: readonly GoodMove[];
}

/** One replay step: the state after the event and what the proposer said. */
export interface ReplayFrame {
  at: number;
  event: NightEvent;
  state: NightState;
  suggestions: readonly Suggestion[];
}
