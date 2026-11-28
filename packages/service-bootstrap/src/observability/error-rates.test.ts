import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import {
  createErrorRateTracker,
  createErrorRateHealthCheck,
  errorRatePlugin_,
} from "./error-rates.js";

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
    const [entry] = snap.endpoints;
    if (!entry) throw new Error("expected an endpoint entry");
    expect(entry.endpoint).toBe("/api/v1/users");
    expect(entry.total).toBe(1);
    expect(entry.errors).toBe(0);
    expect(entry.rate).toBe(0);
  });

  it("records an error request (4xx/5xx) with isError=true", () => {
    const tracker = createErrorRateTracker();

    tracker.record("/api/v1/reservations", 500);

    const snap = tracker.snapshot();
    const [entry] = snap.endpoints;
    if (!entry) throw new Error("expected an endpoint entry");
    expect(entry.errors).toBe(1);
    expect(entry.total).toBe(1);
    expect(entry.rate).toBe(1);
  });

  it("treats 5xx as a server error", () => {
    const tracker = createErrorRateTracker();
    [500, 502, 503, 504].forEach((code) => {
      tracker.record(`/api/${code}`, code);
    });

    const snap = tracker.snapshot();
    expect(snap.endpoints).toHaveLength(4);
    for (const ep of snap.endpoints) {
      expect(ep.errors).toBe(1);
      expect(ep.clientErrors).toBe(0);
    }
  });

  it("counts 4xx as client errors, not server errors", () => {
    const tracker = createErrorRateTracker();
    [400, 401, 403, 404, 422].forEach((code) => {
      tracker.record(`/api/${code}`, code);
    });

    const snap = tracker.snapshot();
    expect(snap.endpoints).toHaveLength(5);
    for (const ep of snap.endpoints) {
      expect(ep.errors).toBe(0);
      expect(ep.rate).toBe(0);
      expect(ep.clientErrors).toBe(1);
    }
  });

  it("counts 408, 429 and 499 as neither server nor client errors", () => {
    const tracker = createErrorRateTracker();
    [408, 429, 499].forEach((code) => {
      tracker.record(`/api/${code}`, code);
    });

    const snap = tracker.snapshot();
    expect(snap.endpoints).toHaveLength(3);
    for (const ep of snap.endpoints) {
      expect(ep.total).toBe(1);
      expect(ep.errors).toBe(0);
      expect(ep.clientErrors).toBe(0);
    }
  });

  it("does not degrade on six 401s on one endpoint, and reports them as client errors", () => {
    const tracker = createErrorRateTracker();
    for (let i = 0; i < 6; i++) tracker.record("/api/v1/venues", 401);

    const snap = tracker.snapshot();
    expect(snap.degraded).toBe(false);
    expect(snap.endpoints).toEqual([
      { endpoint: "/api/v1/venues", total: 6, answered: 0, errors: 0, clientErrors: 6, rate: 0 },
    ]);
  });

  it("degrades on six 500s on one endpoint", () => {
    const tracker = createErrorRateTracker();
    for (let i = 0; i < 6; i++) tracker.record("/api/v1/venues", 500);

    const snap = tracker.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.endpoints[0]).toMatchObject({ errors: 6, clientErrors: 0, rate: 1 });
  });

  it("does not degrade on a burst of 429s or 404s", () => {
    const tracker = createErrorRateTracker();
    for (let i = 0; i < 10; i++) tracker.record("/api/v1/a", 429);
    for (let i = 0; i < 10; i++) tracker.record("/api/v1/b", 404);

    expect(tracker.snapshot().degraded).toBe(false);
  });

  it("computes the rate over answered requests, excluding 4xx from the denominator", () => {
    const tracker = createErrorRateTracker();
    // 6 x 200 + 3 x 401 + 1 x 500: answered = 7, rate = 1/7 = 0.143 > 10%
    for (let i = 0; i < 6; i++) tracker.record("/api/v1/mix", 200);
    for (let i = 0; i < 3; i++) tracker.record("/api/v1/mix", 401);
    tracker.record("/api/v1/mix", 500);

    const snap = tracker.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.endpoints[0]).toEqual({
      endpoint: "/api/v1/mix",
      total: 10,
      answered: 7,
      errors: 1,
      clientErrors: 3,
      rate: 0.143,
    });
  });

  it.each([
    ["5x500 + 46x401", 46, 401],
    ["5x500 + 100x401", 100, 401],
    ["5x500 + 50x429", 50, 429],
  ])("client traffic cannot dilute real 5xx: %s is degraded", (_label, noise, noiseStatus) => {
    const tracker = createErrorRateTracker();
    for (let i = 0; i < 5; i++) tracker.record("/api/v1/x", 500);
    for (let i = 0; i < noise; i++) tracker.record("/api/v1/x", noiseStatus);

    const snap = tracker.snapshot();
    expect(snap.degraded).toBe(true);
    expect(snap.endpoints[0]).toMatchObject({ errors: 5, answered: 5, rate: 1 });
  });

  it("applies the 5-request floor to answered requests: 1x500 + 4x401 is not degraded", () => {
    const tracker = createErrorRateTracker();
    tracker.record("/api/v1/x", 500);
    for (let i = 0; i < 4; i++) tracker.record("/api/v1/x", 401);

    expect(tracker.snapshot().degraded).toBe(false);
  });

  it("floor boundary: 4x500 is not degraded, 5x500 is", () => {
    const tracker = createErrorRateTracker();
    for (let i = 0; i < 4; i++) tracker.record("/api/v1/x", 500);
    expect(tracker.snapshot().degraded).toBe(false);

    tracker.record("/api/v1/x", 500);
    expect(tracker.snapshot().degraded).toBe(true);
  });

  it("threshold boundary over answered requests, whatever the 401 count", () => {
    const atThreshold = createErrorRateTracker();
    atThreshold.record("/api/v1/x", 500);
    for (let i = 0; i < 9; i++) atThreshold.record("/api/v1/x", 200);
    for (let i = 0; i < 30; i++) atThreshold.record("/api/v1/x", 401);
    expect(atThreshold.snapshot().degraded).toBe(false);

    const above = createErrorRateTracker();
    for (let i = 0; i < 2; i++) above.record("/api/v1/x", 500);
    for (let i = 0; i < 9; i++) above.record("/api/v1/x", 200);
    for (let i = 0; i < 30; i++) above.record("/api/v1/x", 401);
    expect(above.snapshot().degraded).toBe(true);
  });

  it("reports rate 0 when no request was answered", () => {
    const tracker = createErrorRateTracker();
    for (let i = 0; i < 3; i++) tracker.record("/api/v1/x", 429);

    expect(tracker.snapshot().endpoints[0]).toMatchObject({ answered: 0, rate: 0 });
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
    const [entry] = snap.endpoints;
    if (!entry) throw new Error("expected an endpoint entry");
    expect(entry.rate).toBe(0.5);
    expect(entry.total).toBe(4);
    expect(entry.errors).toBe(2);
  });

  it("rounds error rate to 3 decimal places", () => {
    const tracker = createErrorRateTracker();

    // 1 error out of 3 = 0.333...
    tracker.record("/api/v1/users", 500);
    tracker.record("/api/v1/users", 200);
    tracker.record("/api/v1/users", 200);

    const snap = tracker.snapshot();
    const [entry] = snap.endpoints;
    if (!entry) throw new Error("expected an endpoint entry");
    expect(entry.rate).toBe(0.333);
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
    const [entry] = snap.endpoints;
    if (!entry) throw new Error("expected an endpoint entry");
    expect(entry.total).toBe(1);
    expect(entry.errors).toBe(0);
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
    const [rate0, rate1, rate2] = snap.endpoints.map((e) => e.rate);
    if (rate0 === undefined || rate1 === undefined || rate2 === undefined) {
      throw new Error("expected three rate values");
    }
    expect(rate0).toBeGreaterThanOrEqual(rate1);
    expect(rate1).toBeGreaterThanOrEqual(rate2);
  });
});

describe("createErrorRateHealthCheck", () => {
  it("returns status ok when no degraded endpoints", () => {
    const snapshot = {
      endpoints: [
        { endpoint: "/api/v1/users", total: 10, answered: 10, errors: 0, clientErrors: 0, rate: 0 },
      ],
      degraded: false,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.status).toBe("ok");
    expect(result.message).toBeUndefined();
  });

  it("returns status degraded when degraded=true", () => {
    const snapshot = {
      endpoints: [
        {
          endpoint: "/api/v1/users",
          total: 10,
          answered: 10,
          errors: 2,
          clientErrors: 0,
          rate: 0.2,
        },
      ],
      degraded: true,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.status).toBe("degraded");
  });

  it("returns message listing degraded endpoints with percentages", () => {
    const snapshot = {
      endpoints: [
        {
          endpoint: "/api/v1/users",
          total: 10,
          answered: 10,
          errors: 2,
          clientErrors: 0,
          rate: 0.2,
        },
        { endpoint: "/api/v1/ok", total: 10, answered: 10, errors: 0, clientErrors: 0, rate: 0 },
      ],
      degraded: true,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.message).toContain("/api/v1/users");
    expect(result.message).toContain("20%");
  });

  it("message names exactly the endpoints the tracker degraded on (answered-count rule)", () => {
    const tracker = createErrorRateTracker();
    // diluted by 401s but answered = 5 and all 5xx: degraded and named
    for (let i = 0; i < 5; i++) tracker.record("/api/v1/diluted", 500);
    for (let i = 0; i < 100; i++) tracker.record("/api/v1/diluted", 401);
    // total = 5 but answered = 1: below the floor, must not be named
    tracker.record("/api/v1/thin", 500);
    for (let i = 0; i < 4; i++) tracker.record("/api/v1/thin", 401);

    const result = createErrorRateHealthCheck(tracker.snapshot());
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("/api/v1/diluted (100%)");
    expect(result.message).not.toContain("/api/v1/thin");
  });

  it("passes through endpoints from the snapshot", () => {
    const snapshot = {
      endpoints: [
        { endpoint: "/api/v1/test", total: 5, answered: 5, errors: 1, clientErrors: 0, rate: 0.2 },
      ],
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
      endpoints: [
        { endpoint: "/api/v1/new", total: 3, answered: 3, errors: 3, clientErrors: 0, rate: 1.0 },
      ],
      degraded: false,
    };
    const result = createErrorRateHealthCheck(snapshot);
    expect(result.status).toBe("ok");
  });
});

describe("errorRatePlugin_", () => {
  it("does not count requests that match no route, so a 404 burst cannot mark the service degraded", async () => {
    const app = Fastify();
    await app.register(errorRatePlugin_);
    app.get("/things", async () => ({ ok: true }));
    await app.ready();

    for (let i = 0; i < 10; i += 1) {
      await app.inject({ method: "GET", url: "/health/sentry-heartbeat" });
    }
    await app.inject({ method: "GET", url: "/things" });

    const snapshot = app.getErrorRates();
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.endpoints.map((e) => e.endpoint)).toEqual(["/things"]);
    await app.close();
  });

  it("counts 401s on a matched route as client errors without degrading", async () => {
    const app = Fastify();
    await app.register(errorRatePlugin_);
    app.get("/secure", async (_req, reply) => reply.code(401).send());
    await app.ready();

    for (let i = 0; i < 6; i += 1) {
      await app.inject({ method: "GET", url: "/secure" });
    }

    const snapshot = app.getErrorRates();
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.endpoints).toEqual([
      { endpoint: "/secure", total: 6, answered: 0, errors: 0, clientErrors: 6, rate: 0 },
    ]);
    await app.close();
  });

  it("still skips ignored paths", async () => {
    const app = Fastify();
    await app.register(errorRatePlugin_);
    app.get("/health", async (_req, reply) => reply.code(503).send());
    await app.ready();

    for (let i = 0; i < 6; i += 1) {
      await app.inject({ method: "GET", url: "/health" });
    }

    expect(app.getErrorRates().endpoints).toEqual([]);
    await app.close();
  });
});
