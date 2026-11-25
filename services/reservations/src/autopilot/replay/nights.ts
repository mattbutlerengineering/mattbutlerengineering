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

/** Two free tables both legal for a party of 2; only the 2-top is the known-good move. */
const bestFitChoice: Night = {
  id: "best-fit-choice",
  description: "Offer a party of 2 the free 2-top, not the equally legal free 6-top.",
  initial: {
    tables: [table("T1", 6, "AVAILABLE"), table("T2", 2, "AVAILABLE")],
    reservations: [],
    waitlist: [],
  },
  events: [{ at: 10, type: "waitlist_joined", entry: waiting("w1", 2) }],
  goodMoves: [
    {
      suggestion: { kind: "waitlist_offer", entryId: "w1", tableId: "T2" },
      windowStart: 10,
      windowEnd: 20,
    },
  ],
};

/** A legal offer that is only good inside its window; saying it again later is noise. */
const lateOffer: Night = {
  id: "late-offer",
  description:
    "Offer the waiting party the 4-top when it turns; the same offer 20 minutes later is outside its window.",
  initial: {
    tables: [table("T1", 4, "OCCUPIED")],
    reservations: [res("r1", 4, "T1", "seated")],
    waitlist: [waiting("w1", 2)],
  },
  events: [
    { at: 20, type: "reservation_completed", reservationId: "r1" },
    { at: 21, type: "table_status", tableId: "T1", status: "DIRTY" },
    { at: 25, type: "table_status", tableId: "T1", status: "READY" },
    { at: 30, type: "table_status", tableId: "T1", status: "AVAILABLE" },
    { at: 50, type: "waitlist_joined", entry: waiting("w2", 2) },
  ],
  goodMoves: [
    {
      suggestion: { kind: "waitlist_offer", entryId: "w1", tableId: "T1" },
      windowStart: 30,
      windowEnd: 35,
    },
  ],
};

/** The only free table is smaller than the waiting parties. Do nothing. */
const oversizedParty: Night = {
  id: "oversized-party",
  description: "No move is correct: no free table can seat the waiting parties of 8 and 5.",
  initial: {
    tables: [table("T1", 4, "AVAILABLE"), table("T2", 2, "OCCUPIED")],
    reservations: [res("r1", 2, "T2", "seated")],
    waitlist: [],
  },
  events: [
    { at: 5, type: "waitlist_joined", entry: waiting("w1", 8) },
    { at: 9, type: "waitlist_joined", entry: waiting("w2", 5) },
  ],
  goodMoves: [],
};

/**
 * The 6-top turns first with a party of 4, a party of 2 and a party of 6 waiting. It must go to
 * the party of 6 (nothing else seats them), not to the party that has waited longest. The 4-top
 * turns later and takes the party of 4. The party of 2 is never offered either table.
 */
const scarceBigTable: Night = {
  id: "scarce-big-table",
  description:
    "Hold the only 6-top for the waiting party of 6; the party of 4 takes the 4-top; the party of 2 is not offered a table.",
  initial: {
    tables: [table("T1", 6, "OCCUPIED"), table("T2", 4, "OCCUPIED")],
    reservations: [res("r1", 6, "T1", "seated"), res("r2", 4, "T2", "seated")],
    waitlist: [
      { ...waiting("w1", 4), joinedAt: -30 },
      { ...waiting("w2", 2), joinedAt: -20 },
      { ...waiting("w3", 6), joinedAt: -10 },
    ],
  },
  events: [
    { at: 10, type: "reservation_completed", reservationId: "r1" },
    { at: 11, type: "table_status", tableId: "T1", status: "DIRTY" },
    { at: 12, type: "table_status", tableId: "T1", status: "READY" },
    { at: 13, type: "table_status", tableId: "T1", status: "AVAILABLE" },
    { at: 20, type: "reservation_completed", reservationId: "r2" },
    { at: 21, type: "table_status", tableId: "T2", status: "DIRTY" },
    { at: 22, type: "table_status", tableId: "T2", status: "READY" },
    { at: 23, type: "table_status", tableId: "T2", status: "AVAILABLE" },
  ],
  goodMoves: [
    {
      suggestion: { kind: "waitlist_offer", entryId: "w3", tableId: "T1" },
      windowStart: 13,
      windowEnd: 22,
    },
    {
      suggestion: { kind: "waitlist_offer", entryId: "w1", tableId: "T2" },
      windowStart: 23,
      windowEnd: 33,
    },
  ],
};

export const NIGHTS: readonly Night[] = [
  bigPartyReseat,
  earlyTurnWaitlist,
  quietNight,
  heldTableTrap,
  bestFitChoice,
  lateOffer,
  oversizedParty,
  scarceBigTable,
];
