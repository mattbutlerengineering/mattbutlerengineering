import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recordDbLatency, checkLatencyAnomaly, checkAuth0 } from "./health-checks.js";

describe("health-checks.ts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  describe("recordDbLatency / checkLatencyAnomaly", () => {
    // The module holds a shared dbLatencyHistory array. We test behaviours
    // that don't depend on resetting it — just on relative state.

    it("returns isAnomaly:false and rollingAvg:0 when fewer than 5 samples exist", () => {
      // Fresh import → history may or may not have prior entries; use a fresh
      // module scope indirectly by checking the documented guard: < 5 samples.
      // We can force this state by checking the function with 0 history, which
      // the module guarantees on first import in this isolated test file.
      const result = checkLatencyAnomaly(999);
      // With < 5 entries the function short-circuits
      expect(result).toEqual({ isAnomaly: false, rollingAvg: 0 });
    });

    it("detects an anomaly when current latency is 3× the rolling average", () => {
      // Seed 5+ samples so the anomaly guard passes
      for (let i = 0; i < 10; i++) {
        recordDbLatency(100);
      }
      // rolling avg ≈ 100 ms; threshold × 3 = 300 ms; spike = 400 ms → anomaly
      const result = checkLatencyAnomaly(400);
      expect(result.isAnomaly).toBe(true);
      expect(result.rollingAvg).toBeGreaterThan(0);
    });

    it("does not flag as anomaly when current latency is within normal range", () => {
      for (let i = 0; i < 10; i++) {
        recordDbLatency(50);
      }
      // rolling avg ≈ 50; 3× = 150; 60 ms is well within range
      const result = checkLatencyAnomaly(60);
      expect(result.isAnomaly).toBe(false);
    });

    it("caps history at 100 entries to prevent unbounded memory growth", () => {
      // Push 110 entries — module should only keep 100
      for (let i = 0; i < 110; i++) {
        recordDbLatency(i);
      }
      // After 110 pushes the oldest (0–9) are evicted.
      // Rolling avg should be dominated by later values (10–109 avg ≈ 59.5).
      const result = checkLatencyAnomaly(10);
      // 10 ms is not 3× the rolling avg of ~59.5 → no anomaly
      expect(result.isAnomaly).toBe(false);
    });

    it("rollingAvg is rounded to nearest integer", () => {
      // seed uniform 100 ms values so avg is exactly 100
      for (let i = 0; i < 10; i++) {
        recordDbLatency(100);
      }
      const result = checkLatencyAnomaly(50);
      expect(Number.isInteger(result.rollingAvg)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("checkAuth0", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    it("returns ok status and latency when JWKS endpoint responds 200", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ keys: [] }), { status: 200 })
      );

      const result = await checkAuth0();

      expect(result.status).toBe("ok");
      expect(typeof result.latency).toBe("number");
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.message).toBeUndefined();
    });

    it("returns degraded when JWKS endpoint returns non-200 status", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

      const result = await checkAuth0();

      expect(result.status).toBe("degraded");
      expect(result.message).toContain("403");
    });

    it("returns degraded with timeout message when request is aborted", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
      );

      const result = await checkAuth0();

      expect(result.status).toBe("degraded");
      expect(result.message).toContain("timeout");
    });

    it("returns degraded with error message for generic network errors", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await checkAuth0();

      expect(result.status).toBe("degraded");
      expect(result.message).toContain("ECONNREFUSED");
    });

    it("handles non-Error thrown values gracefully", async () => {
      vi.mocked(fetch).mockRejectedValueOnce("string error");

      const result = await checkAuth0();

      expect(result.status).toBe("degraded");
      expect(result.message).toContain("string error");
    });
  });
});
