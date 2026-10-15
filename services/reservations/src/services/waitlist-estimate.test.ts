import { describe, it, expect } from "vitest";
import {
  estimateWaitFromTurnover,
  type EstimateTable,
  type EstimateReservation,
} from "./waitlist-estimate.js";

const NOW = new Date("2026-06-01T18:00:00Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const table = (id: string, overrides: Partial<EstimateTable> = {}): EstimateTable => ({
  id,
  capacity: 4,
  minCovers: 1,
  maxCovers: null,
  isActive: true,
  ...overrides,
});

const reservation = (
  tableId: string,
  start: number,
  end: number,
  status: EstimateReservation["status"] = "CONFIRMED"
): EstimateReservation => ({ tableId, startTime: at(start), endTime: at(end), status });

// Party of 2 -> default 75 min duration.
const estimates = (
  tables: EstimateTable[],
  reservations: EstimateReservation[],
  positions: number[]
) =>
  positions.map((position) =>
    estimateWaitFromTurnover({ position, partySize: 2, now: NOW, tables, reservations })
  );

describe("estimateWaitFromTurnover", () => {
  it("uses the k-th earliest table free time, cycling by one duration past the table count", () => {
    const tables = [table("t1"), table("t2")];
    const reservations = [reservation("t2", -30, 40)];
    // t1 is free now, t2 frees at +40; each further cycle adds 75 minutes.
    expect(estimates(tables, reservations, [1, 2, 3, 4, 5])).toEqual([0, 40, 75, 115, 150]);
  });

  it("ignores tables the party does not fit and inactive tables", () => {
    const tables = [
      table("small", { capacity: 2, maxCovers: null }),
      table("huge", { capacity: 10, minCovers: 6 }),
      table("off", { isActive: false }),
    ];
    expect(estimates(tables, [], [1, 2])).toEqual([0, 75]);
  });

  it("skips a table blocked by an upcoming reservation starting within the duration", () => {
    const tables = [table("t1"), table("t2")];
    const reservations = [reservation("t2", 30, 105)];
    expect(estimates(tables, reservations, [1, 2])).toEqual([0, 75]);
  });

  it("does not count cancelled or finished reservations", () => {
    const tables = [table("t1")];
    const reservations = [reservation("t1", -30, 40, "CANCELLED"), reservation("t1", -90, -5)];
    expect(estimates(tables, reservations, [1])).toEqual([0]);
  });

  it("returns null when no table fits the party", () => {
    expect(estimates([table("t1", { capacity: 1 })], [], [1])).toEqual([null]);
  });

  it("counts PENDING bookings (the staff default) as occupying a table", () => {
    const tables = [table("t1")];
    const reservations = [reservation("t1", -30, 90, "PENDING")];
    expect(estimates(tables, reservations, [1])).toEqual([90]);
  });

  it("counts an upcoming PENDING booking as a block", () => {
    const tables = [table("t1"), table("t2")];
    const reservations = [reservation("t2", 30, 105, "PENDING")];
    expect(estimates(tables, reservations, [1, 2])).toEqual([0, 75]);
  });

  describe("free window measured from freeAt", () => {
    it("blocks a table occupied until +120 with a booking at +135 (only a 15 min gap)", () => {
      // Party of 2 -> 75 min duration; window is [120, 195) and 135 is inside it.
      const tables = [table("t1")];
      const reservations = [reservation("t1", -30, 120), reservation("t1", 135, 210)];
      expect(estimates(tables, reservations, [1])).toEqual([null]);
    });

    it("blocks when a booking starts exactly at freeAt", () => {
      const tables = [table("t1")];
      const reservations = [reservation("t1", -30, 120), reservation("t1", 120, 195)];
      expect(estimates(tables, reservations, [1])).toEqual([null]);
    });

    it("does not block when the next booking starts exactly freeAt + duration", () => {
      const tables = [table("t1")];
      const reservations = [reservation("t1", -30, 120), reservation("t1", 195, 270)];
      expect(estimates(tables, reservations, [1])).toEqual([120]);
    });
  });
});
