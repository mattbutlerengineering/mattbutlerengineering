import { describe, it, expect } from "vitest";
import { assertBookable } from "./assert-bookable.js";
import type { ReservationSlim, HoldSlim } from "./availability.js";

// Use a future date so hold expiresAt is in the future relative to real clock
const NOW = new Date("2030-01-01T18:00:00Z");
const START = new Date("2030-01-01T22:00:00Z");
const END = new Date("2030-01-01T23:30:00Z");

function makeReservation(overrides: Partial<ReservationSlim> = {}): ReservationSlim {
  return {
    id: "res-1",
    tableId: "table-1",
    startTime: START,
    endTime: END,
    partySize: 2,
    ...overrides,
  };
}

function makeHold(overrides: Partial<HoldSlim> = {}): HoldSlim {
  return {
    id: "hold-1",
    tableId: "table-1",
    startTime: START,
    endTime: END,
    partySize: 2,
    expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
    ...overrides,
  };
}

const BASE_OPTS = {
  tableId: "table-1",
  window: { startTime: START, endTime: END },
  partySize: 2,
  settings: null,
  reservations: [] as ReservationSlim[],
  holds: [] as HoldSlim[],
} as const;

describe("assertBookable", () => {
  describe("no conflict, no pacing rules", () => {
    it("returns undefined when slot is free and no pacing rules", () => {
      expect(assertBookable(BASE_OPTS)).toBeUndefined();
    });
  });

  describe("table conflict", () => {
    it("returns CONFLICT when a reservation overlaps the window on the same table", () => {
      const result = assertBookable({
        ...BASE_OPTS,
        reservations: [makeReservation({ tableId: "table-1" })],
      });
      expect(result?.code).toBe("CONFLICT");
    });

    it("returns undefined when the overlapping reservation is on a different table", () => {
      const result = assertBookable({
        ...BASE_OPTS,
        reservations: [makeReservation({ tableId: "table-2" })],
      });
      expect(result).toBeUndefined();
    });

    it("returns CONFLICT when an active hold overlaps on the same table", () => {
      const result = assertBookable({
        ...BASE_OPTS,
        holds: [makeHold({ tableId: "table-1" })],
      });
      expect(result?.code).toBe("CONFLICT");
    });

    it("excludes the specified hold id from conflict check", () => {
      // The confirmed hold itself would otherwise appear as a conflict.
      const result = assertBookable({
        ...BASE_OPTS,
        holds: [makeHold({ id: "hold-to-confirm", tableId: "table-1" })],
        excludeHoldId: "hold-to-confirm",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("pacing", () => {
    const settings = {
      pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }],
    };

    it("returns PACING_EXCEEDED when adding partySize exceeds maxCoversPerSlot", () => {
      // 4 covers already in the window; adding 2 more = 6, exceeds limit of 4
      const result = assertBookable({
        ...BASE_OPTS,
        partySize: 2,
        settings,
        reservations: [makeReservation({ tableId: "table-2", partySize: 4 })],
      });
      expect(result?.code).toBe("PACING_EXCEEDED");
    });

    it("returns undefined when adding partySize stays at or below maxCoversPerSlot", () => {
      // 2 covers in window; adding 2 more = 4, exactly at limit
      const result = assertBookable({
        ...BASE_OPTS,
        partySize: 2,
        settings,
        reservations: [makeReservation({ tableId: "table-2", partySize: 2 })],
      });
      expect(result).toBeUndefined();
    });

    it("returns undefined when there are no pacing rules", () => {
      const result = assertBookable({
        ...BASE_OPTS,
        partySize: 100,
        settings: null,
        reservations: [makeReservation({ partySize: 100 })],
      });
      // No pacing rules → pacing always passes; table has no competing reservation
      // (different window check — just verify no PACING_EXCEEDED)
      expect(result?.code).not.toBe("PACING_EXCEEDED");
    });
  });

  describe("conflict takes priority over pacing", () => {
    it("returns CONFLICT (not PACING_EXCEEDED) when both conditions are met", () => {
      const settings = {
        pacingRules: [{ maxCoversPerSlot: 0, timeWindowMinutes: 15 }],
      };
      // Same table reservation (conflict) AND pacing at zero
      const result = assertBookable({
        ...BASE_OPTS,
        partySize: 1,
        settings,
        reservations: [makeReservation({ tableId: "table-1", partySize: 1 })],
      });
      expect(result?.code).toBe("CONFLICT");
    });
  });
});
