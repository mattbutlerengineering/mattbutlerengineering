import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  REFRESH_WINDOW_MS,
  classifySessionPhase,
  computeElapsedPercent,
  readEpochClaim,
  useSessionClock,
} from "./useSessionClock.js";

/* ── Visibility helpers ─────────────────────── */

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

/* ── classifySessionPhase ───────────────────── */

describe("classifySessionPhase", () => {
  it("returns fresh when more than the refresh window remains", () => {
    expect(classifySessionPhase(REFRESH_WINDOW_MS + 1)).toBe("fresh");
    expect(classifySessionPhase(10 * 60_000)).toBe("fresh");
    expect(classifySessionPhase(Number.MAX_SAFE_INTEGER)).toBe("fresh");
  });

  it("returns refresh-window at exactly the 5:00 boundary", () => {
    // Pinned: at exactly REFRESH_WINDOW_MS remaining, packages/auth's proactive
    // silent refresh (delay = max(0, remaining - lead)) is already firing, so
    // the boundary itself belongs to the refresh window.
    expect(classifySessionPhase(REFRESH_WINDOW_MS)).toBe("refresh-window");
  });

  it("returns refresh-window inside the window", () => {
    expect(classifySessionPhase(REFRESH_WINDOW_MS - 1)).toBe("refresh-window");
    expect(classifySessionPhase(60_000)).toBe("refresh-window");
    expect(classifySessionPhase(1)).toBe("refresh-window");
  });

  it("returns expired at zero and below", () => {
    expect(classifySessionPhase(0)).toBe("expired");
    expect(classifySessionPhase(-1)).toBe("expired");
    expect(classifySessionPhase(-3_600_000)).toBe("expired");
  });
});

/* ── readEpochClaim ─────────────────────────── */

describe("readEpochClaim", () => {
  it("returns a finite numeric claim", () => {
    expect(readEpochClaim({ exp: 1_700_000_000 }, "exp")).toBe(1_700_000_000);
  });

  it("returns undefined for missing, non-numeric, or non-finite claims", () => {
    expect(readEpochClaim(undefined, "exp")).toBeUndefined();
    expect(readEpochClaim(null, "exp")).toBeUndefined();
    expect(readEpochClaim("not-an-object", "exp")).toBeUndefined();
    expect(readEpochClaim({}, "exp")).toBeUndefined();
    expect(readEpochClaim({ exp: "123" }, "exp")).toBeUndefined();
    expect(readEpochClaim({ exp: Number.NaN }, "exp")).toBeUndefined();
    expect(readEpochClaim({ exp: Infinity }, "exp")).toBeUndefined();
  });
});

/* ── computeElapsedPercent ──────────────────── */

describe("computeElapsedPercent", () => {
  const issuedAt = 1_000; // seconds
  const expiresAt = 1_600; // 600s lifetime

  it("returns the elapsed fraction of the token lifetime as a percent", () => {
    // 600s lifetime, 150s remaining -> 450s elapsed -> 75%
    expect(computeElapsedPercent(issuedAt, expiresAt, 150_000)).toBe(75);
  });

  it("clamps to 100 when expired and 0 when remaining exceeds lifetime", () => {
    expect(computeElapsedPercent(issuedAt, expiresAt, 0)).toBe(100);
    // Clock skew: remaining longer than the whole lifetime clamps to 0, never negative.
    expect(computeElapsedPercent(issuedAt, expiresAt, 900_000)).toBe(0);
  });

  it("returns null when issue time, expiry, or remaining is unknown", () => {
    expect(computeElapsedPercent(undefined, expiresAt, 150_000)).toBeNull();
    expect(computeElapsedPercent(issuedAt, undefined, 150_000)).toBeNull();
    expect(computeElapsedPercent(issuedAt, expiresAt, null)).toBeNull();
  });

  it("returns null for a non-positive lifetime instead of inventing numbers", () => {
    expect(computeElapsedPercent(1_600, 1_600, 0)).toBeNull();
    expect(computeElapsedPercent(1_700, 1_600, 0)).toBeNull();
  });
});

/* ── useSessionClock ────────────────────────── */

describe("useSessionClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
  });

  afterEach(() => {
    setVisibility("visible");
    vi.useRealTimers();
  });

  const nowSec = () => Math.floor(Date.now() / 1000);

  it("returns a null clock when no expiry is known", () => {
    const { result } = renderHook(() => useSessionClock(undefined));
    expect(result.current).toEqual({ remainingMs: null, phase: null });
  });

  it("ticks remaining time down once per second", () => {
    // Computed once — recomputing per render would slide the expiry forward each tick.
    const expiresAt = nowSec() + 600;
    const { result } = renderHook(() => useSessionClock(expiresAt));
    expect(result.current.remainingMs).toBe(600_000);
    expect(result.current.phase).toBe("fresh");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.remainingMs).toBe(599_000);
  });

  it("transitions fresh -> refresh-window -> expired as time passes", () => {
    const expiresAt = nowSec() + 302;
    const { result } = renderHook(() => useSessionClock(expiresAt));
    expect(result.current.phase).toBe("fresh");

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.phase).toBe("refresh-window");

    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(result.current.phase).toBe("expired");
    // Clamped, never negative.
    expect(result.current.remainingMs).toBe(0);
  });

  it("pauses ticking while the document is hidden and snaps on return", () => {
    const expiresAt = nowSec() + 600;
    const { result } = renderHook(() => useSessionClock(expiresAt));

    act(() => {
      setVisibility("hidden");
      vi.advanceTimersByTime(10_000);
    });
    // Hidden: interval is paused, so the rendered value did not move.
    expect(result.current.remainingMs).toBe(600_000);

    act(() => {
      setVisibility("visible");
    });
    // Visible again: snaps immediately to the real remaining time.
    expect(result.current.remainingMs).toBe(590_000);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.remainingMs).toBe(589_000);
  });

  it("stops the interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const expiresAt = nowSec() + 600;
    const { unmount } = renderHook(() => useSessionClock(expiresAt));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
