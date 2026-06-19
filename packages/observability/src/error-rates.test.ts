import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createErrorRateTracker, createErrorRateHealthCheck } from "./error-rates.js";

describe("createErrorRateTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty snapshot when no requests recorded", () => {
    const tracker = createErrorRateTracker();
    const snap = tracker.snapshot();

    expect(snap.endpoints).toEqual([]);
    expect(snap.degraded).toBe(false);
  });

  it("records a successful request (2xx) with isError=false", () => {
    const tracker = createErrorRateTracker();

    tracker.record("/api/v1/users", 200);

    const snap = tracker.snapshot();
    expect(snap.endpoints).toHaveLength(1);
    expect(snap.endpoints[0].endpoint).toBe("/api/v1/users");
    expect(snap.endpoints[0].total).toBe(1);
    expect(snap.endpoints[0].errors).toBe(0);
    expect(snap.endpoints[0].rate).toBe(0);
  });

  it("records an error request (4xx/5xx) with isError=true", () => {
    const tracker = createErrorRateTracker();

    tracker.record("/api/v1/reservations", 500);

    const snap = tracker.snapshot();
    expect(snap.endpoints[0].errors).toBe(1);
    expect(snap.endpoints[0].total).toBe(1);
    expect(snap.endpoints[0].rate).toBe(1);
  });

  it("treats status >= 400 as an error", () => {
    const tracker = createErrorRateTracker();
    [400, 401, 403, 404, 422, 500, 503].forEach((code) => {
      tracker.record(`/api/${code}`, code);
    });

    const snap = tracker.snapshot();
    for (const ep of snap.endpoints) {
      expect(ep.errors).toBe(1);
    }
  });

  it("treats status < 400 as success", () => {
    const tracker = createErrorRateTracker();
    [200, 201, 204, 301, 302, 304, 399].forEach((code) => {
      tracker.record(`/api/${code}`, code);
    });

    const snap = tracker.snapshot();
    for (const ep of snap.endpoints) {
      expect(ep.errors).toBe(0);
    }
  });

  it("calculates error rate correctly", () => {
    const tracker = createErrorRateTracker();

    // 2 errors out of 4 requests = 0.5 rate
    tracker.record("/api/v1/tables", 200);
    tracker.record("/api/v1/tables", 200);
    tracker.record("/api/v1/tables", 500);
    tracker.record("/api/v1/tables", 500);

    const snap = tracker.snapshot();
    expect(snap.endpoints[0].rate).toBe(0.5);
    expect(snap.endpoints[0].total).toBe(4);
    expect(snap.endpoints[0].errors).toBe(2);
  });

  it("rounds error rate to 3 decimal places", () => {
    const tracker = createErrorRateTracker();

    // 1 error out of 3 = 0.333...
    tracker.record("/api/v1/users", 500);
    tracker.record("/api/v1/users", 200);
    tracker.record("/api/v1/users", 200);

    const snap = tracker.snapshot();
    expect(snap.endpoints[0].rate).toBe(0.333);
  });

  it("tracks multiple endpoints independently", () => {
    const tracker = createErrorRateTracker();

    tracker.record("/api/v1/users", 200);
    tracker.record("/api/v1/users", 500);
    tracker.record("/api/v1/reservations", 200);
    tracker.record("/api/v1/reservations", 200);

    const snap = tracker.snapshot();
    expect(snap.endpoints).toHaveLength(2);

    const users = snap.endpoints.find((e) => e.endpoint === "/api/v1/users");
    const reservations = snap.endpoints.find((e) => e.endpoint === "/api/v1/reservations");

    expect(users!.rate).toBe(0.5);
    expect(reservations!.rate).toBe(0);
  });

  it("marks degraded=true when error rate exceeds 10% with >= 5 requests", () => {
    const tracker = createErrorRateTracker();

    // 2 errors out of 10 = 20% > 10% threshold
    for (let i = 0; i < 8; i++) {
      tracker.record("/api/v1/users", 200);
    }
    tracker.record("/api/v1/users", 500);
    tracker.record("/api/v1/users", 500);

    const snap = tracker.snapshot();
    expect(snap.degraded).toBe(true);
  });

  it("does NOT mark degraded when error rate is exactly 10%", () => {
    const tracker = createErrorRateTracker();

    // 1 error out of 10 = 10% — exactly at threshold, not above
    for (let i = 0; i < 9; i++) {
      tracker.record("/api/v1/users", 200);
    }
    tracker.record("/api/v1/users", 500);

    const snap = tracker.snapshot();
    expect(snap.degraded).toBe(false);
  });

  it("does NOT mark degraded when high error rate but fewer than 5 requests", () => {
    const tracker = createErrorRateTracker();

    // 3 errors out of 4 = 75% — but only 4 requests (< 5 minimum)
    tracker.record("/api/v1/users", 500);
    tracker.record("/api/v1/users", 500);
    tracker.record("/api/v1/users", 500);
    tracker.record("/api/v1/users", 200);

    const snap = tracker.snapshot();
    expect(snap.degraded).toBe(false);
  });

  it("prunes requests older than 5-minute window", () => {
    const tracker = createErrorRateTracker();

    tracker.record("/api/v1/users", 500);

    // Advance past the 5-minute window
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const snap = tracker.snapshot();
    expect(snap.endpoints).toHaveLength(0);
  });

  it("removes endpoint entry entirely when all records are pruned", () => {
    const tracker = createErrorRateTracker();

    tracker.record("/api/v1/users", 200);
    tracker.record("/api/v1/users", 500);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const snap = tracker.snapshot();
    expect(snap.endpoints).toHaveLength(0);
    expect(snap.degraded).toBe(false);
  });

  it("keeps recent records while pruning old ones", () => {
    const tracker = createErrorRateTracker();

    // Record old error
    tracker.record("/api/v1/users", 500);

    // Advance 4 minutes
    vi.advanceTimersByTime(4 * 60 * 1000);

    // Record new success
    tracker.record("/api/v1/users", 200);

    // Advance another 1.5 minutes (total 5.5 minutes — old record is pruned)
    vi.advanceTimersByTime(1.5 * 60 * 1000);

    const snap = tracker.snapshot();
    // Only the recent success should remain
    expect(snap.endpoints).toHaveLength(1);
    expect(snap.endpoints[0].total).toBe(1);
    expect(snap.endpoints[0].errors).toBe(0);
  });

  it("sorts endpoints by error rate descending", () => {
    const tracker = createErrorRateTracker();

    // low error rate
    tracker.record("/api/v1/users", 200);
    tracker.record("/api/v1/users", 200);
    tracker.record("/api/v1/users", 500);

    // high error rate
    tracker.record("/api/v1/critical", 500);
    tracker.record("/api/v1/critical", 500);
    tracker.record("/api/v1/critical", 200);

    // zero error rate
    tracker.record("/api/v1/health", 200);

    const snap = tracker.snapshot();
    const rates = snap.endpoints.map((e) => e.rate);
    expect(rates[0]).toBeGreaterThanOrEqual(rates[1]);
    expect(rates[1]).toBeGreaterThanOrEqual(rates[2]);
  });
});

describe("createErrorRateHealthCheck", () => {
  it("returns status ok when no degraded endpoints", () => {
    const snapshot = {
      endpoints: [{ endpoint: "/api/v1/users", total: 10, errors: 0, rate: 0 }],
      degraded: false,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.status).toBe("ok");
    expect(result.message).toBeUndefined();
  });

  it("returns status degraded when degraded=true", () => {
    const snapshot = {
      endpoints: [{ endpoint: "/api/v1/users", total: 10, errors: 2, rate: 0.2 }],
      degraded: true,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.status).toBe("degraded");
  });

  it("returns message listing degraded endpoints with percentages", () => {
    const snapshot = {
      endpoints: [
        { endpoint: "/api/v1/users", total: 10, errors: 2, rate: 0.2 },
        { endpoint: "/api/v1/ok", total: 10, errors: 0, rate: 0 },
      ],
      degraded: true,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.message).toContain("/api/v1/users");
    expect(result.message).toContain("20%");
  });

  it("passes through endpoints from the snapshot", () => {
    const snapshot = {
      endpoints: [{ endpoint: "/api/v1/test", total: 5, errors: 1, rate: 0.2 }],
      degraded: true,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.endpoints).toEqual(snapshot.endpoints);
  });

  it("returns ok with empty endpoints when snapshot has no data", () => {
    const snapshot = { endpoints: [], degraded: false };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.status).toBe("ok");
    expect(result.endpoints).toEqual([]);
  });

  it("low-sample: returns ok even with 100% error rate if fewer than 5 requests", () => {
    // The degraded flag comes from the tracker — if tracker says not degraded, health check says ok
    const snapshot = {
      endpoints: [{ endpoint: "/api/v1/new", total: 3, errors: 3, rate: 1.0 }],
      degraded: false,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.status).toBe("ok");
  });
});
