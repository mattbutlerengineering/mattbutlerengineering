import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRehearsalPlayback } from "./use-rehearsal-playback.js";
import type { RehearsalEvent } from "./types.js";

const h = (hour: number, minute = 0) => hour * 60 + minute;

const EVENTS: RehearsalEvent[] = [
  {
    at: h(18),
    type: "booked",
    reservationId: "r1",
    partySize: 2,
    tableId: "t1",
    arrivesAt: h(18, 45),
  },
  { at: h(18, 45), type: "seated", reservationId: "r1", partySize: 2, tableId: "t1" },
  { at: h(18, 45), type: "status-change", tableId: "t1", status: "OCCUPIED" },
  { at: h(20), type: "departed", reservationId: "r1", tableId: "t1" },
  { at: h(20), type: "status-change", tableId: "t1", status: "DIRTY" },
];

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRehearsalPlayback", () => {
  it("starts paused at the first event", () => {
    const { result } = renderHook(() => useRehearsalPlayback(EVENTS));
    expect(result.current.playing).toBe(false);
    expect(result.current.time).toBe(h(18));
    expect(result.current.end).toBe(h(20));
    expect(result.current.speed).toBe(60);
  });

  it("play advances simulated time at the selected speed", () => {
    const { result } = renderHook(() => useRehearsalPlayback(EVENTS));
    act(() => result.current.play());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // 60x = one simulated minute per real second
    expect(result.current.time).toBeCloseTo(h(18) + 10, 0);

    act(() => result.current.setSpeed(240));
    const before = result.current.time;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.time - before).toBeCloseTo(20, 0);
  });

  it("pause stops the clock", () => {
    const { result } = renderHook(() => useRehearsalPlayback(EVENTS));
    act(() => result.current.play());
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    act(() => result.current.pause());
    const frozen = result.current.time;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.playing).toBe(false);
    expect(result.current.time).toBe(frozen);
  });

  it("scrub jumps and clamps to the event window", () => {
    const { result } = renderHook(() => useRehearsalPlayback(EVENTS));
    act(() => result.current.scrub(h(19)));
    expect(result.current.time).toBe(h(19));
    expect(result.current.state.seatedIds.has("r1")).toBe(true);
    act(() => result.current.scrub(h(23)));
    expect(result.current.time).toBe(h(20));
    act(() => result.current.scrub(0));
    expect(result.current.time).toBe(h(18));
  });

  it("stops at close", () => {
    const { result } = renderHook(() => useRehearsalPlayback(EVENTS));
    act(() => result.current.setSpeed(240));
    act(() => result.current.play());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.time).toBe(h(20));
    expect(result.current.playing).toBe(false);
    expect(result.current.state.metrics.coversServed).toBe(2);
  });

  it("exposes rehearsalStateAt output for the current time", () => {
    const { result } = renderHook(() => useRehearsalPlayback(EVENTS, { tableIds: ["t1", "t2"] }));
    expect(result.current.state.reservations).toHaveLength(1);
    act(() => result.current.scrub(h(19)));
    expect(result.current.state.tableStatuses.get("t1")).toBe("seated");
    expect(result.current.state.metrics.tablesNeverSat).toBe(1);
  });

  it("keeps the same state object across frames within one simulated minute", () => {
    const { result } = renderHook(() => useRehearsalPlayback(EVENTS));
    act(() => result.current.scrub(h(19)));
    const first = result.current.state;
    act(() => result.current.scrub(h(19) + 0.5));
    expect(result.current.state).toBe(first);
  });

  it("reduced motion: play never animates, step jumps to the next event time", () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useRehearsalPlayback(EVENTS));
    expect(result.current.reducedMotion).toBe(true);
    act(() => result.current.play());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.time).toBe(h(18));
    expect(result.current.playing).toBe(false);

    act(() => result.current.step());
    expect(result.current.time).toBe(h(18, 45));
    act(() => result.current.step());
    expect(result.current.time).toBe(h(20));
    act(() => result.current.step());
    expect(result.current.time).toBe(h(20));
  });
});
