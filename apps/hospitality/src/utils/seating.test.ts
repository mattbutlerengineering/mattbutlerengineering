import { describe, expect, it } from "vitest";
import {
  TABLE_VALID_TRANSITIONS,
  type Reservation,
  type Table,
  type TableStatus,
} from "@mbe/types";
import { canSeat, tablesThatFit } from "./seating.js";

const TABLE_STATUSES = Object.keys(TABLE_VALID_TRANSITIONS) as TableStatus[];

function makeReservation(status: Reservation["status"]): Reservation {
  return { status } as Reservation;
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return { id: "t1", name: "T1", capacity: 4, status: "AVAILABLE", ...overrides } as Table;
}

describe("canSeat", () => {
  const SEATABLE: Reservation["status"][] = ["PENDING", "CONFIRMED"];

  it.each(SEATABLE.flatMap((rs) => TABLE_STATUSES.map((ts) => [rs, ts] as const)))(
    "%s reservation on a %s table agrees with TABLE_VALID_TRANSITIONS",
    (rs, ts) => {
      const expected = TABLE_VALID_TRANSITIONS[ts].includes("OCCUPIED");
      expect(canSeat(makeReservation(rs), makeTable({ status: ts }))).toBe(expected);
    }
  );

  it("is only ever true when the table can transition to OCCUPIED", () => {
    for (const ts of TABLE_STATUSES) {
      if (canSeat(makeReservation("PENDING"), makeTable({ status: ts }))) {
        expect(TABLE_VALID_TRANSITIONS[ts]).toContain("OCCUPIED");
      }
    }
  });

  it("offers Seat Guest when the table is unknown (the server decides)", () => {
    expect(canSeat(makeReservation("PENDING"), undefined)).toBe(true);
  });

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"] as const)(
    "never offers it for a %s reservation",
    (status) => {
      expect(canSeat(makeReservation(status), makeTable())).toBe(false);
    }
  );
});

describe("tablesThatFit", () => {
  const tables = [
    makeTable({ id: "a", capacity: 6 }),
    makeTable({ id: "b", capacity: 2 }),
    makeTable({ id: "c", capacity: 4 }),
    makeTable({ id: "d", capacity: 4, status: "OCCUPIED" }),
    makeTable({ id: "e", capacity: 4, status: "DIRTY" }),
  ];

  it("keeps seatable tables with enough capacity, smallest first", () => {
    expect(tablesThatFit(tables, 3).map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("does not mutate its input", () => {
    const copy = [...tables];
    tablesThatFit(tables, 1);
    expect(tables).toEqual(copy);
  });
});
