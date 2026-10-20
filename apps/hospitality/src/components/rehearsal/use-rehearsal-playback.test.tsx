import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRehearsalPlayback } from "./use-rehearsal-playback";
import { eventIndexAt } from "./rehearsal-state";
import type { RehearsalEvent } from "./simulate-service";

const OPEN = 1020;
const CLOSE = 1380;

const EVENTS: readonly RehearsalEvent[] = [
  { at: 1030, kind: "booked", partyId: "p1", size: 2, tableId: "a", startAt: 1100, endAt: 1160 },
  { at: 1100, kind: "seated", partyId: "p1", tableId: "a", size: 2, endAt: 1160 },
  { at: 1160, kind: "departed", partyId: "p1", tableId: "a" },
  { at: 1160, kind: "status-change", tableId: "a", to: "dirty" },
  { at: 1300, kind: "walk-in-waiting", partyId: "p2", size: 4 },
];

let pending: FrameRequestCallback | null = null;
let nextId = 0;
let cancelled = 0;

function frame(ts: number): void {
  act(() => {
    const cb = pending;
    pending = null;
    cb?.(ts);
  });
}

function setup(reducedMotion = false) {
  return renderHook(() =>
    useRehearsalPlayback(EVENTS, { openMinute: OPEN, closeMinute: CLOSE, reducedMotion })
  );
}

beforeEach(() => {
  pending = null;
  nextId = 0;
  cancelled = 0;
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    nextId += 1;
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = null;
    cancelled += 1;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useRehearsalPlayback clock (SC-4)", () => {
  it("starts playing at 60x from open under normal motion", () => {
    const { result } = setup();
    expect(result.current.minute).toBe(OPEN);
    expect(result.current.playing).toBe(true);
    expect(result.current.speed).toBe(60);
    expect(result.current.atEnd).toBe(false);
  });

  it.each([
    [15, 0.25],
    [60, 1],
    [240, 4],
  ] as const)("advances %ix by %s simulated minutes per real second", (speed, expected) => {
    const { result } = setup();
    act(() => result.current.setSpeed(speed));
    frame(0);
    frame(250);
    frame(500);
    frame(750);
    frame(1000);
    expect(result.current.minute).toBe(OPEN + expected);
  });

  it("pause freezes the clock and cancels the frame", () => {
    const { result } = setup();
    frame(0);
    frame(250);
    act(() => result.current.pause());
    const frozen = result.current.minute;
    expect(result.current.playing).toBe(false);
    expect(pending).toBeNull();
    frame(5000);
    expect(result.current.minute).toBe(frozen);
  });

  it("caps a long frame gap at 250 ms", () => {
    const { result } = setup();
    frame(0);
    frame(60_000);
    expect(result.current.minute).toBe(OPEN + 0.25);
  });

  it("commits in quarter-minute steps", () => {
    const { result } = setup();
    frame(0);
    frame(100);
    expect(result.current.minute).toBe(OPEN);
    frame(200);
    expect(result.current.minute).toBe(OPEN);
    frame(300);
    expect(result.current.minute).toBe(OPEN + 0.25);
  });

  it("scrubTo jumps and pauses, and releaseScrub resumes only if it was playing", () => {
    const { result } = setup();
    act(() => result.current.scrubTo(1100));
    expect(result.current.minute).toBe(1100);
    expect(result.current.playing).toBe(false);
    act(() => result.current.releaseScrub());
    expect(result.current.playing).toBe(true);

    act(() => result.current.pause());
    act(() => result.current.scrubTo(1200));
    act(() => result.current.releaseScrub());
    expect(result.current.playing).toBe(false);
    expect(result.current.minute).toBe(1200);
  });

  it("clamps scrubTo to the night", () => {
    const { result } = setup();
    act(() => result.current.scrubTo(9999));
    expect(result.current.minute).toBe(CLOSE);
    act(() => result.current.scrubTo(-5));
    expect(result.current.minute).toBe(OPEN);
  });

  it("stops at close and reports atEnd", () => {
    const { result } = setup();
    act(() => result.current.scrubTo(CLOSE - 0.5));
    act(() => result.current.releaseScrub());
    expect(result.current.playing).toBe(true);
    frame(0);
    frame(250);
    frame(500);
    frame(750);
    expect(result.current.minute).toBe(CLOSE);
    expect(result.current.atEnd).toBe(true);
    expect(result.current.playing).toBe(false);
    expect(pending).toBeNull();
  });

  it("restart replays from open", () => {
    const { result } = setup();
    act(() => result.current.scrubTo(CLOSE));
    act(() => result.current.restart());
    expect(result.current.minute).toBe(OPEN);
    expect(result.current.atEnd).toBe(false);
    expect(result.current.playing).toBe(true);
  });

  it("eventIndex matches a linear scan", () => {
    const { result } = setup();
    for (let i = 0; i < 40; i += 1) {
      const m = OPEN + ((i * 37) % (CLOSE - OPEN));
      act(() => result.current.scrubTo(m));
      expect(result.current.eventIndex).toBe(EVENTS.filter((e) => e.at <= m).length);
      expect(result.current.eventIndex).toBe(eventIndexAt(EVENTS, m));
    }
  });

  it("cancels the frame on unmount", () => {
    const { unmount } = setup();
    expect(pending).not.toBeNull();
    unmount();
    expect(pending).toBeNull();
    expect(cancelled).toBeGreaterThan(0);
  });
});

describe("useRehearsalPlayback commit throttle", () => {
  it("halves the commit rate after a slow commit and never skips ahead of the clock", () => {
    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      t += 60;
      return t;
    });
    const { result } = setup();
    act(() => result.current.setSpeed(240));
    frame(0);
    frame(100); // 0.4 min -> commit, measured slow (60 ms apart)
    const afterSlow = result.current.minute;
    expect(afterSlow).toBe(OPEN + 0.25);
    frame(200); // under the 125 ms gap since the last commit
    expect(result.current.minute).toBe(afterSlow);
    frame(300); // clock kept running; commit catches up to the exact minute
    expect(result.current.minute).toBe(OPEN + 1);
  });
});

describe("useRehearsalPlayback reduced motion (SC-11)", () => {
  it("starts paused at open and schedules no animation frame", () => {
    const { result } = setup(true);
    expect(result.current.playing).toBe(false);
    expect(result.current.minute).toBe(OPEN);
    expect(pending).toBeNull();
    act(() => result.current.play());
    expect(pending).toBeNull();
  });

  it("advances 15 simulated minutes per second while playing", () => {
    const { result } = setup(true);
    act(() => result.current.play());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.minute).toBe(OPEN + 15);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.minute).toBe(OPEN + 45);
  });

  it("clears the interval on pause and unmount", () => {
    const { result, unmount } = setup(true);
    act(() => result.current.play());
    expect(vi.getTimerCount()).toBe(1);
    act(() => result.current.pause());
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.play());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("steps by whole events, forwards and back", () => {
    const { result } = setup(true);
    act(() => result.current.stepEvent(1));
    expect(result.current.minute).toBe(1030);
    act(() => result.current.stepEvent(1));
    expect(result.current.minute).toBe(1100);
    act(() => result.current.stepEvent(1));
    expect(result.current.minute).toBe(1160);
    act(() => result.current.stepEvent(1));
    expect(result.current.minute).toBe(1300);
    act(() => result.current.stepEvent(1));
    expect(result.current.minute).toBe(1300);
    act(() => result.current.stepEvent(-1));
    expect(result.current.minute).toBe(1160);
    act(() => result.current.stepEvent(-1));
    act(() => result.current.stepEvent(-1));
    act(() => result.current.stepEvent(-1));
    expect(result.current.minute).toBe(OPEN);
  });
});
