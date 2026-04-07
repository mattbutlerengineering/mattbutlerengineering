/**
 * Tests for the rate limiter module.
 *
 * Run: npx vitest run infrastructure/worker/rate-limiter.test.js
 */

import { describe, it, expect, vi } from "vitest";
import {
  RATE_LIMITS,
  findRateLimit,
  rateLimitKey,
  checkRateLimit,
  rateLimitResponse,
} from "./rate-limiter.js";

// ── Helpers ──────────────────────────────────────────────────────────

function createMockKv(data = {}) {
  return {
    get: vi.fn(async (key) => data[key] || null),
    put: vi.fn(async () => {}),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Rate Limiter", () => {
  describe("RATE_LIMITS configuration", () => {
    it("has rate limits for flags, health, and general API", () => {
      const patterns = RATE_LIMITS.map((r) => r.pattern);
      expect(patterns).toContain("/api/flags/");
      expect(patterns).toContain("/health/system");
      expect(patterns).toContain("/api/");
    });

    it("flags limit is strictest", () => {
      const flagsLimit = RATE_LIMITS.find((r) => r.pattern === "/api/flags/");
      const apiLimit = RATE_LIMITS.find((r) => r.pattern === "/api/");
      expect(flagsLimit.maxRequests).toBeLessThan(apiLimit.maxRequests);
    });

    it("is frozen (immutable)", () => {
      expect(Object.isFrozen(RATE_LIMITS)).toBe(true);
    });
  });

  describe("findRateLimit", () => {
    it("matches /api/flags/ paths to the flags rule", () => {
      const rule = findRateLimit("/api/flags/dark-mode");
      expect(rule.pattern).toBe("/api/flags/");
      expect(rule.maxRequests).toBe(5);
    });

    it("matches /health/system to the health rule", () => {
      const rule = findRateLimit("/health/system");
      expect(rule.pattern).toBe("/health/system");
      expect(rule.maxRequests).toBe(10);
    });

    it("matches /api/v1/users to the general API rule", () => {
      const rule = findRateLimit("/api/v1/users");
      expect(rule.pattern).toBe("/api/");
      expect(rule.maxRequests).toBe(100);
    });

    it("returns null for non-rate-limited paths", () => {
      const rule = findRateLimit("/hospitality/");
      expect(rule).toBeNull();
    });

    it("prefers more specific pattern (flags over general API)", () => {
      const rule = findRateLimit("/api/flags/test");
      expect(rule.pattern).toBe("/api/flags/");
    });
  });

  describe("rateLimitKey", () => {
    it("builds a key with pattern, IP, and minute bucket", () => {
      const key = rateLimitKey("/api/", "1.2.3.4", 60_000);
      expect(key).toBe("ratelimit:_api_:1.2.3.4:1");
    });

    it("sanitizes IP addresses with colons (IPv6)", () => {
      const key = rateLimitKey("/api/", "::1", 0);
      expect(key).toBe("ratelimit:_api_:::1:0");
    });

    it("uses same bucket for requests in the same minute", () => {
      const key1 = rateLimitKey("/api/", "1.2.3.4", 30_000);
      const key2 = rateLimitKey("/api/", "1.2.3.4", 59_999);
      expect(key1).toBe(key2);
    });

    it("uses different bucket for requests in different minutes", () => {
      const key1 = rateLimitKey("/api/", "1.2.3.4", 59_999);
      const key2 = rateLimitKey("/api/", "1.2.3.4", 60_000);
      expect(key1).not.toBe(key2);
    });
  });

  describe("checkRateLimit", () => {
    it("allows requests for non-rate-limited paths", async () => {
      const kv = createMockKv();
      const result = await checkRateLimit(kv, "/hospitality/", "1.2.3.4", Date.now());
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
    });

    it("allows first request and decrements remaining", async () => {
      const kv = createMockKv();
      const result = await checkRateLimit(kv, "/health/system", "1.2.3.4", Date.now());
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // 10 - 1
      expect(result.limit).toBe(10);
    });

    it("increments counter in KV", async () => {
      const kv = createMockKv();
      await checkRateLimit(kv, "/health/system", "1.2.3.4", Date.now());
      expect(kv.put).toHaveBeenCalledWith(
        expect.any(String),
        "1",
        { expirationTtl: 60 }
      );
    });

    it("blocks requests that exceed the limit", async () => {
      const now = Date.now();
      const key = `ratelimit:_health_system:1.2.3.4:${Math.floor(now / 60_000)}`;
      const kv = createMockKv({ [key]: "10" });
      const result = await checkRateLimit(kv, "/health/system", "1.2.3.4", now);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("fails open on KV read error", async () => {
      const kv = {
        get: vi.fn(async () => { throw new Error("KV down"); }),
        put: vi.fn(async () => {}),
      };
      const result = await checkRateLimit(kv, "/health/system", "1.2.3.4", Date.now());
      expect(result.allowed).toBe(true);
    });

    it("tracks per-IP separately", async () => {
      const kv = createMockKv();
      const now = Date.now();
      const result1 = await checkRateLimit(kv, "/health/system", "1.2.3.4", now);
      const result2 = await checkRateLimit(kv, "/health/system", "5.6.7.8", now);
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      // Different IPs should use different KV keys
      const key1 = kv.put.mock.calls[0][0];
      const key2 = kv.put.mock.calls[1][0];
      expect(key1).not.toBe(key2);
    });
  });

  describe("rateLimitResponse", () => {
    it("returns 429 status", () => {
      const response = rateLimitResponse();
      expect(response.status).toBe(429);
    });

    it("includes Retry-After header", () => {
      const response = rateLimitResponse(30);
      expect(response.headers.get("Retry-After")).toBe("30");
    });

    it("returns JSON error body", async () => {
      const response = rateLimitResponse();
      const body = await response.json();
      expect(body.error).toBe("Too Many Requests");
    });
  });
});
