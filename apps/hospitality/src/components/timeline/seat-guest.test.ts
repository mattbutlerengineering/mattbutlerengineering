import { describe, expect, it } from "vitest";
import type { Reservation, Table } from "@mbe/types";
import { canSeat, findReservationTable, occupiedCaption, statusWord } from "./seat-guest.js";

const START = "2026-09-04T19:00:00.000Z";
const END = "2026-09-04T21:00:00.000Z";
const MINUTE = 60_000;

const at = (iso: string, deltaMs = 0): Date => new Date(new Date(iso).getTime() + deltaMs);

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    date: "2026-09-04",
    startTime: START,
    endTime: END,
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Priya Shah",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "t4",
    venueId: "venue-1",
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "t4",
    name: "T5",
    tableNumber: null,
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 1,
    status: "OCCUPIED",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: START,
    updatedAt: START,
    ...overrides,
  };
}

describe("occupiedCaption", () => {
  it("is null once the party is still at its own table past endTime, running over (#5270)", () => {
    const reservation = makeReservation();
    const table = makeTable({ status: "OCCUPIED" });

    // The party is running one minute over its 19:00-21:00 slot; the table hasn't turned.
    expect(occupiedCaption(reservation, table, at(END, MINUTE))).toBeNull();
  });

  it("still explains a missing Seat Guest when a different, earlier party occupies the table", () => {
    const reservation = makeReservation();
    const table = makeTable({ status: "OCCUPIED" });

    // 30 minutes before this reservation's own start — any OCCUPIED reading here belongs to
    // whichever party is still there, not to this reservation.
    expect(occupiedCaption(reservation, table, at(START, -30 * MINUTE))).toBe(
      "T5 is still occupied — turn it or move the party."
    );
  });

  it("is null once seated (within the 15-minute-early to endTime window)", () => {
    const reservation = makeReservation();
    const table = makeTable({ status: "OCCUPIED" });

    expect(occupiedCaption(reservation, table, at(START, -15 * MINUTE))).toBeNull();
    expect(occupiedCaption(reservation, table, at(START))).toBeNull();
    expect(occupiedCaption(reservation, table, at(END))).toBeNull();
  });

  it("is null when the button is present (table not OCCUPIED)", () => {
    const reservation = makeReservation();
    const table = makeTable({ status: "AVAILABLE" });

    expect(occupiedCaption(reservation, table, at(START, -30 * MINUTE))).toBeNull();
  });

  it("is null for a status outside PENDING/CONFIRMED even on an OCCUPIED table", () => {
    const reservation = makeReservation({ status: "COMPLETED" });
    const table = makeTable({ status: "OCCUPIED" });

    expect(occupiedCaption(reservation, table, at(START, -30 * MINUTE))).toBeNull();
  });

  it("is null when the reservation's table is unknown (undefined)", () => {
    const reservation = makeReservation();

    expect(occupiedCaption(reservation, undefined, at(START, -30 * MINUTE))).toBeNull();
  });

  it("still shows for a PENDING party whose table is occupied, no matter the time", () => {
    const reservation = makeReservation({ status: "PENDING" });
    const table = makeTable({ status: "OCCUPIED" });

    // PENDING reservations never derive as "seated" (isSeated requires CONFIRMED), so the
    // own-party grace window in occupiedCaption must not apply to them either.
    expect(occupiedCaption(reservation, table, at(END, MINUTE))).toBe(
      "T5 is still occupied — turn it or move the party."
    );
  });
});

describe("findReservationTable / canSeat / statusWord (unchanged behaviour)", () => {
  it("finds the reservation's table by id", () => {
    const reservation = makeReservation({ tableId: "t4" });
    const table = makeTable({ id: "t4" });

    expect(findReservationTable(reservation, [table])).toBe(table);
  });

  it("canSeat is true for a seatable status on a non-OCCUPIED table", () => {
    const reservation = makeReservation({ status: "PENDING" });
    const table = makeTable({ status: "AVAILABLE" });

    expect(canSeat(reservation, table)).toBe(true);
  });

  it("statusWord reads 'Seated' when seated, regardless of underlying status", () => {
    const reservation = makeReservation({ status: "CONFIRMED" });

    expect(statusWord(reservation, true)).toBe("Seated");
    expect(statusWord(reservation, false)).toBe("Confirmed");
  });
});
