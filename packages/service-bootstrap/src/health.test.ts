import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLatencyTracker, checkAuth0, type LatencyTracker } from "./health.js";

describe("createLatencyTracker", () => {
  let tracker: LatencyTracker;

  beforeEach(() => {
    tracker = createLatencyTracker();
  });

  it("returns no anomaly when history has fewer than 5 entries", () => {
    tracker.record(10);
    tracker.record(12);
    const result = tracker.checkAnomaly(100);
    expect(result.isAnomaly).toBe(false);
    expect(result.rollingAvg).toBe(0);
  });

  it("detects anomaly when current latency exceeds 3x rolling average", () => {
    // Build up 5+ entries with ~10ms latency
    for (let i = 0; i < 10; i++) {
      tracker.record(10);
    }
    // 100ms is 10x the rolling avg of 10ms — well above 3x threshold
    const result = tracker.checkAnomaly(100);
    expect(result.isAnomaly).toBe(true);
    expect(result.rollingAvg).toBe(10);
  });

  it("returns no anomaly when current latency is within 3x rolling average", () => {
    for (let i = 0; i < 10; i++) {
      tracker.record(10);
    }
    // 25ms is 2.5x the rolling avg — below 3x threshold
    const result = tracker.checkAnomaly(25);
    expect(result.isAnomaly).toBe(false);
  });

  it("caps history at 100 entries", () => {
    for (let i = 0; i < 150; i++) {
      tracker.record(10);
    }
    // Should still work correctly — oldest entries trimmed
    const result = tracker.checkAnomaly(10);
    expect(result.isAnomaly).toBe(false);
  });
});

describe("checkAuth0", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns ok when Auth0 JWKS endpoint responds successfully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await checkAuth0();
    expect(result.status).toBe("ok");
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(result.message).toBeUndefined();
  });

  it("returns degraded when Auth0 JWKS responds with non-ok status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const result = await checkAuth0();
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("Auth0 JWKS returned 503");
  });

  it("returns degraded when fetch throws an error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const result = await checkAuth0();
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("Auth0 JWKS unreachable");
  });

  it("returns degraded with timeout message on AbortError", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await checkAuth0();
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("timeout");
  });

  it("accepts custom JWKS URL", async () => {
    const customUrl = "https://custom.auth0.com/.well-known/jwks.json";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await checkAuth0(customUrl);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      customUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("uses AUTH0_JWKS_URL env var as default when no URL is passed", async () => {
    const envUrl = "https://prod-tenant.us.auth0.com/.well-known/jwks.json";
    process.env.AUTH0_JWKS_URL = envUrl;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    try {
      await checkAuth0();
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
        envUrl,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    } finally {
      delete process.env.AUTH0_JWKS_URL;
    }
  });

  it("falls back to dev URL when AUTH0_JWKS_URL env var is unset", async () => {
    delete process.env.AUTH0_JWKS_URL;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await checkAuth0();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/.well-known/jwks.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
