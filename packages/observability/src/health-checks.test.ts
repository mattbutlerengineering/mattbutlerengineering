import { describe, it, expect, vi } from "vitest";
import { checkLatencyAnomaly, recordDbLatency, checkAuth0 } from "./health-checks.js";

// Reset latency history between tests by re-importing is tricky with ESM.
// Instead we exercise the module state via public API.

describe("checkLatencyAnomaly", () => {
  it("returns no anomaly when history is too short (<5 samples)", () => {
    const result = checkLatencyAnomaly(1000);
    expect(result.isAnomaly).toBe(false);
    expect(result.rollingAvg).toBe(0);
  });

  it("detects anomaly when current latency is 3x rolling average", () => {
    // Seed 5 samples of ~10ms each
    for (let i = 0; i < 10; i++) {
      recordDbLatency(10);
    }
    const result = checkLatencyAnomaly(500); // 500ms >> 3x avg of 10ms
    expect(result.isAnomaly).toBe(true);
    expect(result.rollingAvg).toBeGreaterThan(0);
  });

  it("does not flag anomaly when latency is within normal range", () => {
    for (let i = 0; i < 10; i++) {
      recordDbLatency(20);
    }
    const result = checkLatencyAnomaly(25); // 25ms vs avg 20ms — not 3x
    expect(result.isAnomaly).toBe(false);
  });
});

describe("checkAuth0", () => {
  it("returns degraded when fetch throws (timeout/abort)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted."), { name: "AbortError" })
    );

    const result = await checkAuth0();
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("Auth0 JWKS unreachable (timeout >2s)");

    fetchSpy.mockRestore();
  });

  it("returns degraded when auth0 returns non-ok status", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 503 })
    );

    const result = await checkAuth0();
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("503");

    fetchSpy.mockRestore();
  });

  it("returns ok when auth0 responds 200", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ keys: [] }), { status: 200 })
    );

    const result = await checkAuth0();
    expect(result.status).toBe("ok");
    expect(result.latency).toBeGreaterThanOrEqual(0);

    fetchSpy.mockRestore();
  });
});

describe("recordDbLatency", () => {
  it("is callable without error", () => {
    expect(() => recordDbLatency(15)).not.toThrow();
  });
});
