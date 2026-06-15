import { describe, it, expect } from "vitest";
import { scanForRateLimitPatterns } from "../rate-limit-detector.js";

/**
 * Canonical pattern coverage test.
 *
 * The union of patterns previously found across all four implementations:
 *   - rate-limit-detector.ts (scanForRateLimitPatterns)
 *   - claude-adapter.ts (detectRateLimitInError)
 *   - gemini-adapter.ts (detectRateLimiting)
 *   - opencode-adapter.ts (detectRateLimiting)
 *
 * No pattern that any adapter previously matched should be dropped.
 */
describe("scanForRateLimitPatterns", () => {
  describe("rate.?limit pattern", () => {
    it("matches 'rate limit'", () => {
      expect(scanForRateLimitPatterns("Anthropic API rate limit exceeded")).toBe(true);
    });

    it("matches 'rate-limit' (hyphenated)", () => {
      expect(scanForRateLimitPatterns("rate-limit reached")).toBe(true);
    });

    it("matches 'ratelimit' (no separator)", () => {
      expect(scanForRateLimitPatterns("ratelimit error")).toBe(true);
    });
  });

  describe("quota.?exceeded pattern", () => {
    it("matches 'quota exceeded'", () => {
      expect(scanForRateLimitPatterns("quota exceeded for project")).toBe(true);
    });

    it("matches 'quota-exceeded' (hyphenated)", () => {
      expect(scanForRateLimitPatterns("quota-exceeded")).toBe(true);
    });
  });

  describe("usage.?limit pattern", () => {
    it("matches 'usage limit'", () => {
      expect(scanForRateLimitPatterns("usage limit reached")).toBe(true);
    });

    it("matches 'usage-limit' (hyphenated)", () => {
      expect(scanForRateLimitPatterns("usage-limit exceeded")).toBe(true);
    });
  });

  describe("try.?again.?later pattern", () => {
    it("matches 'try again later'", () => {
      expect(scanForRateLimitPatterns("Please try again later")).toBe(true);
    });

    it("matches 'try-again-later' (hyphenated)", () => {
      expect(scanForRateLimitPatterns("try-again-later")).toBe(true);
    });
  });

  describe("429 pattern", () => {
    it("matches '429' as a word boundary", () => {
      expect(scanForRateLimitPatterns("HTTP 429 Too Many Requests")).toBe(true);
    });

    it("matches 'status 429'", () => {
      expect(scanForRateLimitPatterns("Request failed with status 429: Too Many Requests")).toBe(
        true
      );
    });
  });

  describe("throttled pattern", () => {
    it("matches 'throttled'", () => {
      expect(scanForRateLimitPatterns("Request was throttled by the API")).toBe(true);
    });

    it("matches 'THROTTLED' (case insensitive)", () => {
      expect(scanForRateLimitPatterns("THROTTLED")).toBe(true);
    });
  });

  describe("too.?many.?requests pattern", () => {
    it("matches 'too many requests'", () => {
      expect(scanForRateLimitPatterns("too many requests, try again later")).toBe(true);
    });

    it("matches 'too-many-requests' (hyphenated)", () => {
      expect(scanForRateLimitPatterns("too-many-requests")).toBe(true);
    });
  });

  describe("non-matching inputs", () => {
    it("returns false for normal output", () => {
      expect(scanForRateLimitPatterns("Successfully completed task.")).toBe(false);
    });

    it("returns false for unrelated error", () => {
      expect(scanForRateLimitPatterns("Network timeout connecting to API")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(scanForRateLimitPatterns("")).toBe(false);
    });

    it("returns false for SDK connection failure", () => {
      expect(scanForRateLimitPatterns("SDK connection failed")).toBe(false);
    });

    it("returns false for internal server error", () => {
      expect(scanForRateLimitPatterns("Internal server error")).toBe(false);
    });
  });
});
