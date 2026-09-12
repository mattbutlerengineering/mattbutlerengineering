import { describe, expect, it } from "vitest";
import { isSeated, seatedReservationIds } from "./seated.js";

const START = "2026-09-04T19:00:00.000Z";
const END = "2026-09-04T20:30:00.000Z";
const MINUTE = 60_000;

const confirmed = {
  id: "res_1",
  status: "CONFIRMED" as const,
  startTime: START,
  endTime: END,
  tableId: "tbl_1",
};

const at = (iso: string, deltaMs = 0): Date => new Date(new Date(iso).getTime() + deltaMs);

describe("isSeated", () => {
  it("is true from 15 minutes before start through the end, on an OCCUPIED table", () => {
    expect(isSeated(confirmed, "OCCUPIED", at(START, -15 * MINUTE))).toBe(true);
    expect(isSeated(confirmed, "OCCUPIED", at(START))).toBe(true);
    expect(isSeated(confirmed, "OCCUPIED", at(END))).toBe(true);
  });

  it("is false just outside the window", () => {
    expect(isSeated(confirmed, "OCCUPIED", at(START, -16 * MINUTE))).toBe(false);
    expect(isSeated(confirmed, "OCCUPIED", at(END, 1_000))).toBe(false);
  });

  it("needs the authoritative table to be OCCUPIED", () => {
    expect(isSeated(confirmed, "AVAILABLE", at(START))).toBe(false);
    expect(isSeated(confirmed, "DIRTY", at(START))).toBe(false);
    expect(isSeated(confirmed, undefined, at(START))).toBe(false);
  });

  it("needs a CONFIRMED reservation", () => {
    expect(isSeated({ ...confirmed, status: "PENDING" }, "OCCUPIED", at(START))).toBe(false);
    expect(isSeated({ ...confirmed, status: "COMPLETED" }, "OCCUPIED", at(START))).toBe(false);
  });

  it("is false for an unparseable startTime instead of throwing", () => {
    expect(isSeated({ ...confirmed, startTime: "soon" }, "OCCUPIED", at(START))).toBe(false);
  });
});

describe("seatedReservationIds", () => {
  it("collects the ids seated right now, looking tables up by tableId", () => {
    const tables = [
      { id: "tbl_1", status: "OCCUPIED" as const },
      { id: "tbl_2", status: "AVAILABLE" as const },
    ];
    // res_2 carries a stale embedded `table` claiming OCCUPIED; the authoritative list says AVAILABLE
    const reservations = [
      confirmed,
      { ...confirmed, id: "res_2", tableId: "tbl_2", table: { id: "tbl_2", status: "OCCUPIED" } },
      { ...confirmed, id: "res_3", tableId: "tbl_missing" },
      { ...confirmed, id: "res_4", status: "PENDING" as const },
    ];

    const seated = seatedReservationIds(reservations, tables, at(START));

    expect([...seated]).toEqual(["res_1"]);
    expect(seated.has("res_2")).toBe(false); // A4.2: the embedded copy is ignored
  });

  it("returns an empty set when nothing is seated", () => {
    expect(seatedReservationIds([confirmed], [], at(START)).size).toBe(0);
  });
});
