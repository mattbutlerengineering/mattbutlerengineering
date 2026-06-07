import { describe, it, expect } from "vitest";
import { createCircuitBreaker } from "./remediation-circuit-breaker.js";

describe("remediation-circuit-breaker", () => {
  describe("check", () => {
    it("allows requests when circuit is closed", () => {
      const breaker = createCircuitBreaker();
      const result = breaker.check();
      expect(result).toEqual({ allowed: true });
    });

    it("blocks requests when circuit is open", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);

      const result = breaker.check();
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Circuit open/);
      expect(result.reason).toMatch(/3 consecutive/);
    });

    it("includes time-to-reset in reason when circuit is open", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);

      const result = breaker.check();
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Resets in \d+ min/);
    });

    it("transitions to half-open after reset period elapses", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);

      expect(breaker.check().allowed).toBe(false);

      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + 31 * 60 * 1000;

      try {
        const result = breaker.check();
        expect(result).toEqual({ allowed: true });
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe("recordOutcome", () => {
    it("keeps circuit closed on fewer than threshold failures", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);

      expect(breaker.check().allowed).toBe(true);
    });

    it("opens circuit on exactly threshold consecutive failures", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);

      expect(breaker.check().allowed).toBe(false);
    });

    it("opens circuit on more than threshold consecutive failures", () => {
      const breaker = createCircuitBreaker();
      for (let i = 0; i < 5; i++) {
        breaker.recordOutcome(false);
      }

      const result = breaker.check();
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/5 consecutive/);
    });

    it("resets failure count on success", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      breaker.recordOutcome(true);

      expect(breaker.check().allowed).toBe(true);
    });

    it("closes circuit when success follows open state after half-open", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      expect(breaker.check().allowed).toBe(false);

      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + 31 * 60 * 1000;

      try {
        expect(breaker.check().allowed).toBe(true);
        breaker.recordOutcome(true);
        expect(breaker.check().allowed).toBe(true);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it("re-opens circuit if half-open attempt fails", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);

      const originalDateNow = Date.now;
      const baseTime = originalDateNow();
      Date.now = () => baseTime + 31 * 60 * 1000;

      try {
        breaker.check();
        breaker.recordOutcome(false);
        breaker.recordOutcome(false);
        breaker.recordOutcome(false);

        const result = breaker.check();
        expect(result.allowed).toBe(false);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it("does not open circuit when failures are non-consecutive", () => {
      const breaker = createCircuitBreaker();
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);
      breaker.recordOutcome(true);
      breaker.recordOutcome(false);
      breaker.recordOutcome(false);

      expect(breaker.check().allowed).toBe(true);
    });
  });

  describe("instance isolation", () => {
    it("does not share state between separate breakers", () => {
      const a = createCircuitBreaker();
      const b = createCircuitBreaker();

      a.recordOutcome(false);
      a.recordOutcome(false);
      a.recordOutcome(false);

      expect(a.check().allowed).toBe(false);
      expect(b.check().allowed).toBe(true);
    });

    it("honors a custom failureThreshold", () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1 });
      breaker.recordOutcome(false);

      expect(breaker.check().allowed).toBe(false);
    });
  });
});
