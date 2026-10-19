import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimitMonitor } from "./rate-limit-monitor.js";

describe("createRateLimitMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero stats when no hits recorded", () => {
    const monitor = createRateLimitMonitor();
    const snapshot = monitor.getSnapshot();

    expect(snapshot.stats.hits_last_hour).toBe(0);
    expect(snapshot.stats.blocked_ips).toBe(0);
    expect(snapshot.isDegraded).toBe(false);
  });

  it("records hits and reports them in snapshot", () => {
    const monitor = createRateLimitMonitor();

    monitor.recordHit("1.2.3.4", "/api/v1/users");
    monitor.recordHit("5.6.7.8", "/api/v1/users/me");

    const snapshot = monitor.getSnapshot();
    expect(snapshot.stats.hits_last_hour).toBe(2);
    expect(snapshot.stats.blocked_ips).toBe(2);
    expect(snapshot.isDegraded).toBe(false);
  });

  it("counts unique IPs correctly when same IP hits multiple times", () => {
    const monitor = createRateLimitMonitor();

    monitor.recordHit("1.2.3.4", "/api/v1/users");
    monitor.recordHit("1.2.3.4", "/api/v1/users/me");
    monitor.recordHit("5.6.7.8", "/api/v1/users");

    const snapshot = monitor.getSnapshot();
    expect(snapshot.stats.hits_last_hour).toBe(3);
    expect(snapshot.stats.blocked_ips).toBe(2);
  });

  it("prunes hits older than the hour window", () => {
    const monitor = createRateLimitMonitor({ hourWindowMs: 60_000 });

    monitor.recordHit("1.2.3.4", "/test");

    // Advance past the window
    vi.advanceTimersByTime(61_000);

    const snapshot = monitor.getSnapshot();
    expect(snapshot.stats.hits_last_hour).toBe(0);
    expect(snapshot.stats.blocked_ips).toBe(0);
  });

  it("reports degraded when hits exceed threshold within degraded window", () => {
    const monitor = createRateLimitMonitor({
      degradedWindowMs: 300_000,
      degradedThreshold: 5,
    });

    for (let i = 0; i < 6; i++) {
      monitor.recordHit(`10.0.0.${i}`, "/api/test");
    }

    const snapshot = monitor.getSnapshot();
    expect(snapshot.isDegraded).toBe(true);
    expect(snapshot.stats.hits_last_hour).toBe(6);
    expect(snapshot.stats.blocked_ips).toBe(6);
  });

  it("does not report degraded when hits are at exactly the threshold", () => {
    const monitor = createRateLimitMonitor({
      degradedWindowMs: 300_000,
      degradedThreshold: 5,
    });

    for (let i = 0; i < 5; i++) {
      monitor.recordHit(`10.0.0.${i}`, "/api/test");
    }

    const snapshot = monitor.getSnapshot();
    expect(snapshot.isDegraded).toBe(false);
  });

  it("does not report degraded when old hits fall outside the degraded window", () => {
    const monitor = createRateLimitMonitor({
      hourWindowMs: 3_600_000,
      degradedWindowMs: 60_000,
      degradedThreshold: 3,
    });

    // Record 4 hits (above threshold)
    for (let i = 0; i < 4; i++) {
      monitor.recordHit("1.2.3.4", "/test");
    }

    // Advance past degraded window but within hour window
    vi.advanceTimersByTime(61_000);

    const snapshot = monitor.getSnapshot();
    expect(snapshot.stats.hits_last_hour).toBe(4); // still in hour window
    expect(snapshot.isDegraded).toBe(false); // outside degraded window
  });

  it("returns frozen snapshot objects", () => {
    const monitor = createRateLimitMonitor();
    monitor.recordHit("1.2.3.4", "/test");

    const snapshot = monitor.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.stats)).toBe(true);
  });

  it("reset clears all recorded data", () => {
    const monitor = createRateLimitMonitor();

    monitor.recordHit("1.2.3.4", "/test");
    monitor.recordHit("5.6.7.8", "/test");
    monitor.reset();

    const snapshot = monitor.getSnapshot();
    expect(snapshot.stats.hits_last_hour).toBe(0);
    expect(snapshot.stats.blocked_ips).toBe(0);
  });

  it("returns a frozen monitor interface", () => {
    const monitor = createRateLimitMonitor();
    expect(Object.isFrozen(monitor)).toBe(true);
  });
});
