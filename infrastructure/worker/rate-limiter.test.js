/**
 * Tests for the rate limiter module.
 *
 * Run: npx vitest run infrastructure/worker/rate-limiter.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RATE_LIMITS,
  findRateLimit,
  rateLimitKey,
  checkRateLimit,
  rateLimitResponse,
} from "./rate-limiter.js";
import topologyConfig from "./routes-config.json" with { type: "json" };

// ── Helpers ──────────────────────────────────────────────────────────

// Built from the rule table so the paths cannot drift from it.
const ruleFor = (binding) => RATE_LIMITS.find((r) => r.binding === binding);
const API_PROBE = `${ruleFor("RATE_LIMIT_API").pattern}probe`;
const FLAGS_PROBE = `${ruleFor("RATE_LIMIT_FLAGS").pattern}probe`;

function createLimiter(success = true) {
  return { limit: vi.fn(async () => ({ success })) };
}

function createEnv(success = true) {
  return Object.fromEntries(RATE_LIMITS.map((r) => [r.binding, createLimiter(success)]));
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

    it("gives every rule a distinct declared binding and namespace id", () => {
      const bindings = RATE_LIMITS.map((r) => r.binding);
      const ids = RATE_LIMITS.map((r) => r.namespaceId);
      expect(new Set(bindings).size).toBe(RATE_LIMITS.length);
      expect(new Set(ids).size).toBe(RATE_LIMITS.length);
      for (const r of RATE_LIMITS) {
        expect(r.binding).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(r.namespaceId).toMatch(/^[1-9][0-9]*$/);
        expect([10, 60]).toContain(r.windowSeconds);
      }
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

    it("bounds the unauthenticated /csp-report sink (#8895)", () => {
      const rule = findRateLimit("/csp-report");
      expect(rule).not.toBeNull();
      expect(rule.pattern).toBe("/csp-report");
      expect(rule.maxRequests).toBeLessThanOrEqual(100);
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
    it("builds a key from the pattern and IP", () => {
      expect(rateLimitKey("/api/", "1.2.3.4")).toBe("_api_:1.2.3.4");
    });

    it("keeps IPv6 colons and sanitizes other characters", () => {
      expect(rateLimitKey("/api/", "::1")).toBe("_api_:::1");
      expect(rateLimitKey("/api/", "a b")).toBe("_api_:a_b");
    });
  });

  describe("checkRateLimit", () => {
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("allows requests for non-rate-limited paths without touching a binding", async () => {
      const env = createEnv();
      const result = await checkRateLimit(env, "/hospitality/", "1.2.3.4");
      expect(result).toEqual({ allowed: true, remaining: -1, limit: -1 });
      for (const limiter of Object.values(env)) expect(limiter.limit).not.toHaveBeenCalled();
    });

    it("allows when the binding says success, reporting the limit as best-effort remaining", async () => {
      const result = await checkRateLimit(createEnv(true), "/health/system", "1.2.3.4");
      expect(result).toEqual({ allowed: true, remaining: 10, limit: 10 });
    });

    it("calls only the matching rule's binding with the per-IP key", async () => {
      const env = createEnv();
      await checkRateLimit(env, "/health/system", "1.2.3.4");
      expect(env.RATE_LIMIT_HEALTH_SYSTEM.limit).toHaveBeenCalledWith({
        key: "_health_system:1.2.3.4",
      });
      expect(env.RATE_LIMIT_API.limit).not.toHaveBeenCalled();
    });

    it("blocks when the binding says no", async () => {
      const result = await checkRateLimit(createEnv(false), "/health/system", "1.2.3.4");
      expect(result).toEqual({ allowed: false, remaining: 0, limit: 10 });
    });

    it("keys different IPs separately", async () => {
      const env = createEnv();
      await checkRateLimit(env, API_PROBE, "1.2.3.4");
      await checkRateLimit(env, API_PROBE, "5.6.7.8");
      const keys = env.RATE_LIMIT_API.limit.mock.calls.map((c) => c[0].key);
      expect(new Set(keys).size).toBe(2);
    });

    it("fails open and warns once when the binding is missing", async () => {
      const first = await checkRateLimit({}, "/csp-report", "1.2.3.4");
      await checkRateLimit({}, "/csp-report", "1.2.3.4");
      expect(first.allowed).toBe(true);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.warn.mock.calls[0][0]).toContain("RATE_LIMIT_CSP_REPORT");
    });

    it("fails open and warns once when the binding throws", async () => {
      const env = {
        RATE_LIMIT_FLAGS: {
          limit: vi.fn(async () => {
            throw new Error("boom");
          }),
        },
      };
      const first = await checkRateLimit(env, FLAGS_PROBE, "1.2.3.4");
      await checkRateLimit(env, FLAGS_PROBE, "1.2.3.4");
      expect(first.allowed).toBe(true);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.warn.mock.calls[0][0]).toContain("boom");
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

// ── Coupling to the edge topology registry ───────────────────────────
// This limiter runs BEFORE the origin-proxy branch and is keyed by its own
// table, so a prefix added to routes-config.json's originRoutes does NOT
// become rate limited by virtue of being proxied. That gap is invisible to
// lint, typecheck and every other test: an absent limit and a present one
// look identical unless something asserts the coupling. It shipped once --
// /public was proxied to the origin with limit -1 (unlimited) while its /api
// sibling was bounded at 100/min -- and this is what stops it recurring.
describe("originRoutes coverage", () => {
  it("gives every proxied origin prefix an edge rate limit", async () => {
    const env = createEnv();
    for (const prefix of topologyConfig.originRoutes) {
      // Probe a path below the prefix, which is the shape real traffic takes
      // and the shape the /api/ pattern already matches.
      const result = await checkRateLimit(env, `${prefix}/probe`, "1.2.3.4");
      expect(
        result.limit,
        `${prefix}/* is proxied to the origin with no edge bound`
      ).toBeGreaterThan(0);
    }
  });

  it("bounds the unauthenticated /public surface exactly as tightly as /api", () => {
    const api = RATE_LIMITS.find((r) => r.pattern === "/api/");
    const pub = RATE_LIMITS.find((r) => r.pattern === "/public/");
    expect(pub).toBeDefined();
    expect(pub.maxRequests).toBe(api.maxRequests);
    expect(pub.windowSeconds).toBe(api.windowSeconds);
  });
});
