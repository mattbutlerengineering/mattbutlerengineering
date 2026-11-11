import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { GuestSignalEventData, Reservation, Table } from "@mbe/types";

const NOW = new Date("2026-11-11T19:20:00.000Z");
const START = "2026-11-11T19:30:00.000Z";

const state = vi.hoisted(() => ({
  reservations: [] as unknown[],
  signals: new Map<string, unknown>(),
}));
const useReservations = vi.hoisted(() => vi.fn());

vi.mock("./useNow.js", () => ({ useNow: () => NOW }));
vi.mock("./useStaffTonight.js", () => ({ useStaffTonight: () => ({ serviceDate: "2026-11-11" }) }));
vi.mock("./useReservations.js", () => ({
  useReservations: (params: unknown) => {
    useReservations(params);
    return { data: state.reservations };
  },
}));
vi.mock("./useSSESync.js", () => ({ useGuestSignals: () => state.signals }));

import { useTableGuestSignalBadges } from "./useTableGuestSignalBadges.js";

const lateSignal: GuestSignalEventData = {
  reservationId: "r1",
  kind: "running-late",
  minutes: 15,
  eta: "2026-11-11T19:45:00.000Z",
};
const reservation = {
  id: "r1",
  tableId: "t1",
  status: "CONFIRMED",
  startTime: START,
  endTime: "2026-11-11T21:30:00.000Z",
};
const tables = (status: Table["status"]) => [{ id: "t1", status } as Table];

describe("useTableGuestSignalBadges", () => {
  it("reads tonight's reservations for the venue and badges the signalled table", () => {
    state.reservations = [reservation as unknown as Reservation];
    state.signals = new Map([["r1", lateSignal]]);
    const { result } = renderHook(() => useTableGuestSignalBadges("v1", tables("AVAILABLE")));
    expect(useReservations).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "v1", date: "2026-11-11" })
    );
    expect(result.current.get("t1")).toEqual({
      minutes: 15,
      eta: "2026-11-11T19:45:00.000Z",
      held: true,
    });
  });

  it("clears the badge once the party is seated (its table is occupied)", () => {
    state.reservations = [reservation as unknown as Reservation];
    state.signals = new Map([["r1", lateSignal]]);
    const { result } = renderHook(() => useTableGuestSignalBadges("v1", tables("OCCUPIED")));
    expect(result.current.size).toBe(0);
  });
});
