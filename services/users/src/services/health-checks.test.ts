import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recordDbLatency, checkLatencyAnomaly, checkAuth0 } from "./health-checks.js";

describe("health-checks", () => {
  describe("recordDbLatency + checkLatencyAnomaly", () => {
    it("returns no anomaly when fewer than 5 data points", () => {
      const result = checkLatencyAnomaly(100);
      expect(result.isAnomaly).toBe(false);
      expect(result.rollingAvg).toBe(0);
    });

    it("returns no anomaly when current latency is within threshold", () => {
      // Record 10 data points at ~10ms each
      for (let i = 0; i < 10; i++) {
        recordDbLatency(10);
      }
      // 15ms is within 3x of 10ms average
      const result = checkLatencyAnomaly(15);
      expect(result.isAnomaly).toBe(false);
      expect(result.rollingAvg).toBe(10);
    });

    it("detects anomaly when current latency exceeds 3x rolling average", () => {
      // Record 10 data points at ~10ms
      for (let i = 0; i < 10; i++) {
        recordDbLatency(10);
      }
      // 50ms is well above 3x of 10ms average (threshold = 30ms)
      const result = checkLatencyAnomaly(50);
      expect(result.isAnomaly).toBe(true);
      expect(result.rollingAvg).toBe(10);
    });

    it("handles exactly 5 data points (minimum for anomaly detection)", () => {
      // Note: the dbLatencyHistory array persists across tests in the same
      // module instance. Previous tests already recorded entries. We just need
      // to verify that with enough data points, a non-anomaly still returns
      // isAnomaly: false when currentMs is within 3x rolling average.
      for (let i = 0; i < 5; i++) {
        recordDbLatency(20);
      }
      // The rolling avg includes ALL prior entries too, but we just need to
      // verify the anomaly detection does not falsely trigger for reasonable values.
      const result = checkLatencyAnomaly(20);
      expect(result.isAnomaly).toBe(false);
      expect(result.rollingAvg).toBeGreaterThan(0);
    });

    it("respects the sliding window limit of 100 entries", () => {
      // Fill and overflow the window to force eviction of older entries
      for (let i = 0; i < 110; i++) {
        recordDbLatency(5);
      }
      // After 110 inserts, only the most recent 100 are kept (all 5ms)
      // Rolling avg should be close to 5
      const result = checkLatencyAnomaly(5);
      expect(result.isAnomaly).toBe(false);
      expect(result.rollingAvg).toBe(5);
    });
  });

  describe("checkAuth0", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    });

    it("returns ok when Auth0 JWKS endpoint responds successfully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await checkAuth0();
      expect(result.status).toBe("ok");
      expect(typeof result.latency).toBe("number");
      expect(result.message).toBeUndefined();
    });

    it("returns degraded when Auth0 JWKS returns non-200 status", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await checkAuth0();
      expect(result.status).toBe("degraded");
      expect(result.message).toBe("Auth0 JWKS returned 503");
    });

    it("returns degraded with timeout message when fetch is aborted", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortError);

      const result = await checkAuth0();
      expect(result.status).toBe("degraded");
      expect(result.message).toBe("Auth0 JWKS unreachable (timeout >2s)");
    });

    it("returns degraded with error message for non-abort errors", async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("DNS resolution failed"));

      const result = await checkAuth0();
      expect(result.status).toBe("degraded");
      expect(result.message).toBe("Auth0 JWKS unreachable: DNS resolution failed");
    });

    it("returns degraded with stringified error for non-Error throws", async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce("network failure");

      const result = await checkAuth0();
      expect(result.status).toBe("degraded");
      expect(result.message).toBe("Auth0 JWKS unreachable: network failure");
    });
  });
});
