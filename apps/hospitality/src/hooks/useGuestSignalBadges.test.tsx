import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { GuestSignalEventData, Reservation } from "@mbe/types";

const signals = vi.hoisted(() => ({ current: new Map<string, unknown>() }));
vi.mock("./useSSESync.js", () => ({ useGuestSignals: () => signals.current }));

import { useGuestSignalBadges } from "./useGuestSignalBadges.js";

const START = "2026-11-11T19:30:00.000Z";
const reservations = [
  { id: "r1", status: "CONFIRMED", startTime: START },
  { id: "r2", status: "CONFIRMED", startTime: START },
] as Reservation[];
const lateSignal = (id: string): GuestSignalEventData => ({
  reservationId: id,
  kind: "running-late",
  minutes: 15,
  eta: "2026-11-11T19:45:00.000Z",
});
const now = new Date("2026-11-11T19:20:00.000Z");

describe("useGuestSignalBadges", () => {
  it("badges reservations with a live late signal and omits seated or unsignalled ones", () => {
    signals.current = new Map([
      ["r1", lateSignal("r1")],
      ["r2", lateSignal("r2")],
    ]);
    const { result } = renderHook(() => useGuestSignalBadges(reservations, new Set(["r2"]), now));
    expect([...result.current.keys()]).toEqual(["r1"]);
    expect(result.current.get("r1")).toEqual({
      minutes: 15,
      eta: "2026-11-11T19:45:00.000Z",
      held: true,
    });
  });
});
