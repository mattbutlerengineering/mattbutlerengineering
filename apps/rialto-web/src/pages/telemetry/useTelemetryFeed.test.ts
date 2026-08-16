import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { telemetryFrame, useTelemetryFeed } from "./useTelemetryFeed";

const SEED = 7;
const INTERVAL = 800;

describe("telemetryFrame", () => {
  it("is a pure function of seed and index", () => {
    expect(telemetryFrame(SEED, 3, INTERVAL)).toEqual(telemetryFrame(SEED, 3, INTERVAL));
  });

  it("produces a different session for a different seed", () => {
    expect(telemetryFrame(SEED, 3, INTERVAL)).not.toEqual(telemetryFrame(SEED + 1, 3, INTERVAL));
  });

  it("derives its clock from the frame index, never the wall clock", () => {
    expect(telemetryFrame(SEED, 0, INTERVAL).t).toBe(0);
    expect(telemetryFrame(SEED, 5, INTERVAL).t).toBe(5 * INTERVAL);
  });

  it("carries every region the HUD renders", () => {
    const frame = telemetryFrame(SEED, 2, INTERVAL);

    expect(frame.zones.length).toBeGreaterThan(0);
    expect(frame.zones.map((zone) => zone.id)).toContain(frame.activeZoneId);
    expect(frame.events.length).toBeGreaterThan(0);
    expect(frame.vitals.throttle).toBeGreaterThanOrEqual(0);
    expect(frame.vitals.throttle).toBeLessThanOrEqual(1);
  });
});

describe("useTelemetryFeed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in connecting, then goes live", () => {
    const { result } = renderHook(() =>
      useTelemetryFeed({ seed: SEED, frozen: false, intervalMs: INTERVAL })
    );

    expect(result.current.kind).toBe("connecting");

    act(() => {
      vi.advanceTimersByTime(INTERVAL);
    });

    expect(result.current.kind).toBe("live");
  });

  it("advances the frame clock by one interval per tick", () => {
    const { result } = renderHook(() =>
      useTelemetryFeed({ seed: SEED, frozen: false, intervalMs: INTERVAL })
    );

    act(() => {
      vi.advanceTimersByTime(INTERVAL * 3);
    });

    expect(result.current.kind === "live" && result.current.frame.t).toBe(INTERVAL * 3);
  });

  it("resolves one fixed frame and never ticks when frozen", () => {
    const { result } = renderHook(() =>
      useTelemetryFeed({ seed: SEED, frozen: true, intervalMs: INTERVAL })
    );

    const first = result.current;
    expect(first.kind).toBe("live");

    act(() => {
      vi.advanceTimersByTime(INTERVAL * 10);
    });

    expect(result.current).toEqual(first);
  });

  it("reports empty before the feed has started", () => {
    const { result } = renderHook(() =>
      useTelemetryFeed({ seed: SEED, frozen: false, started: false, intervalMs: INTERVAL })
    );

    expect(result.current.kind).toBe("empty");
  });

  it("holds the last frame when paused", () => {
    const { result, rerender } = renderHook(
      (paused: boolean) =>
        useTelemetryFeed({ seed: SEED, frozen: false, paused, intervalMs: INTERVAL }),
      { initialProps: false }
    );

    act(() => {
      vi.advanceTimersByTime(INTERVAL * 2);
    });
    const held = result.current.kind === "live" ? result.current.frame : undefined;

    rerender(true);
    act(() => {
      vi.advanceTimersByTime(INTERVAL * 5);
    });

    expect(result.current.kind).toBe("hold");
    expect(result.current.kind === "hold" && result.current.frame).toEqual(held);
  });

  it("retains the last frame and its capture time when degraded", () => {
    const { result, rerender } = renderHook(
      (degraded: boolean) =>
        useTelemetryFeed({ seed: SEED, frozen: false, degraded, intervalMs: INTERVAL }),
      { initialProps: false }
    );

    act(() => {
      vi.advanceTimersByTime(INTERVAL * 2);
    });

    rerender(true);
    act(() => {
      vi.advanceTimersByTime(INTERVAL * 5);
    });

    expect(result.current.kind).toBe("stale");
    expect(result.current.kind === "stale" && result.current.since).toBe(INTERVAL * 2);
  });
});
