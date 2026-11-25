import type {
  Night,
  NightReservation,
  NightTable,
  NightWaitlistEntry,
  ReservationPhase,
} from "./types.js";

function table(
  id: string,
  capacity: number,
  status: NightTable["status"],
  minCovers = 1
): NightTable {
  return { id, capacity, minCovers, maxCovers: capacity, isActive: true, status };
}

function res(
  id: string,
  partySize: number,
  tableId: string,
  phase: ReservationPhase
): NightReservation {
  return { id, partySize, tableId, phase };
}

function waiting(id: string, partySize: number): NightWaitlistEntry {
  return { id, partySize, status: "waiting" };
}

/**
 * A 2-top frees up while a party of 2 holds the only 6-top and a party of 6
 * waits. Reseating the small party to the 2-top is the move; once they sit,
 * the 6-top goes to the waitlist. Offering the 6-top early double-books it.
 */
const bigPartyReseat: Night = {
  id: "big-party-reseat",
  description: "Reseat a party of 2 to a freed 2-top so the 6-top can go to a waiting party of 6.",
  initial: {
    tables: [
      table("T1", 2, "OCCUPIED"),
      table("T2", 6, "AVAILABLE", 2),
      table("T3", 4, "OCCUPIED"),
    ],
    reservations: [
      res("r0", 2, "T1", "seated"),
      res("r1", 2, "T2", "booked"),
      res("r3", 4, "T3", "seated"),
    ],
    waitlist: [],
  },
  events: [
    { at: 5, type: "reservation_arrived", reservationId: "r1" },
    { at: 15, type: "waitlist_joined", entry: waiting("w1", 6) },
    { at: 25, type: "reservation_completed", reservationId: "r0" },
    { at: 26, type: "table_status", tableId: "T1", status: "DIRTY" },
    { at: 30, type: "table_status", tableId: "T1", status: "READY" },
    { at: 35, type: "table_status", tableId: "T1", status: "AVAILABLE" },
    { at: 45, type: "reservation_seated", reservationId: "r1", tableId: "T1" },
    { at: 52, type: "waitlist_joined", entry: waiting("w2", 2) },
  ],
  goodMoves: [
    {
      suggestion: { kind: "reseat", reservationId: "r1", toTableId: "T1" },
      windowStart: 35,
      windowEnd: 40,
    },
    {
      suggestion: { kind: "waitlist_offer", entryId: "w1", tableId: "T2" },
      windowStart: 45,
      windowEnd: 55,
    },
  ],
};

/** A 4-top turns early with two waiters; the first in line that fits gets it, and not while it is dirty. */
const earlyTurnWaitlist: Night = {
  id: "early-turn-waitlist",
  description: "Offer the first waiting party a 4-top the moment it turns early.",
  initial: {
    tables: [table("T1", 4, "OCCUPIED"), table("T2", 2, "OCCUPIED")],
    reservations: [res("r1", 4, "T1", "seated"), res("r2", 2, "T2", "seated")],
    waitlist: [],
  },
  events: [
    { at: 10, type: "waitlist_joined", entry: waiting("w1", 3) },
    { at: 12, type: "waitlist_joined", entry: waiting("w2", 2) },
    { at: 40, type: "reservation_completed", reservationId: "r1" },
    { at: 41, type: "table_status", tableId: "T1", status: "DIRTY" },
    { at: 45, type: "table_status", tableId: "T1", status: "READY" },
    { at: 50, type: "table_status", tableId: "T1", status: "AVAILABLE" },
    { at: 58, type: "reservation_completed", reservationId: "r2" },
  ],
  goodMoves: [
    {
      suggestion: { kind: "waitlist_offer", entryId: "w1", tableId: "T1" },
      windowStart: 50,
      windowEnd: 60,
    },
  ],
};

/** Everything is already where it should be. The right answer is silence. */
const quietNight: Night = {
  id: "quiet-night",
  description: "No move is correct: every party sits at the table it booked.",
  initial: {
    tables: [table("T1", 2, "AVAILABLE"), table("T2", 4, "OCCUPIED")],
    reservations: [res("r1", 2, "T1", "booked"), res("r2", 4, "T2", "seated")],
    waitlist: [],
  },
  events: [
    { at: 10, type: "reservation_arrived", reservationId: "r1" },
    { at: 20, type: "reservation_seated", reservationId: "r1", tableId: "T1" },
    { at: 60, type: "reservation_completed", reservationId: "r2" },
    { at: 61, type: "table_status", tableId: "T2", status: "DIRTY" },
    { at: 65, type: "table_status", tableId: "T2", status: "READY" },
    { at: 70, type: "table_status", tableId: "T2", status: "AVAILABLE" },
  ],
  goodMoves: [],
};

/** A free table that looks tempting but is held for an arriving booking, with a waiter in line. Do nothing. */
const heldTableTrap: Night = {
  id: "held-table-trap",
  description:
    "No move is correct: the only free table is held for a booked party, so a waitlist offer would double-book it.",
  initial: {
    tables: [table("T1", 2, "AVAILABLE"), table("T2", 2, "OCCUPIED")],
    reservations: [res("r1", 2, "T1", "booked"), res("r2", 2, "T2", "seated")],
    waitlist: [],
  },
  events: [
    { at: 5, type: "waitlist_joined", entry: waiting("w1", 2) },
    { at: 8, type: "reservation_arrived", reservationId: "r1" },
    { at: 14, type: "reservation_seated", reservationId: "r1", tableId: "T1" },
  ],
  goodMoves: [],
};

export const NIGHTS: readonly Night[] = [
  bigPartyReseat,
  earlyTurnWaitlist,
  quietNight,
  heldTableTrap,
];
