import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recordDbLatency, checkLatencyAnomaly, checkAuth0 } from "./health-checks.js";

describe("Health Checks Service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("DB Latency Anomaly Detection", () => {
    it("reports no anomaly with few data points", () => {
      recordDbLatency(10);
      expect(checkLatencyAnomaly(100).isAnomaly).toBe(false);
    });

    it("detects anomalies with sufficient data", () => {
      // Add 5 points: avg = 10
      for (let i = 0; i < 5; i++) recordDbLatency(10);

      const result = checkLatencyAnomaly(40); // 4x avg, threshold is 3x
      expect(result.isAnomaly).toBe(true);
      expect(result.rollingAvg).toBe(10);
    });

    it("does not flag normal latency as anomaly", () => {
      for (let i = 0; i < 5; i++) recordDbLatency(10);
      expect(checkLatencyAnomaly(15).isAnomaly).toBe(false);
    });
  });

  describe("Auth0 Health Check", () => {
    it("reports ok when fetch succeeds", async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
      const result = await checkAuth0();
      expect(result.status).toBe("ok");
      expect(result.latency).toBeDefined();
    });

    it("reports degraded when fetch fails", async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      const result = await checkAuth0();
      expect(result.status).toBe("degraded");
      expect(result.message).toContain("returned 500");
    });

    it("reports degraded on timeout", async () => {
      vi.mocked(fetch).mockImplementation(() => {
        const error = new Error("AbortError");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      const result = await checkAuth0();
      expect(result.status).toBe("degraded");
      expect(result.message).toContain("timeout");
    });
  });
});
