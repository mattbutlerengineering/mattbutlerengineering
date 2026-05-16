import { describe, it, expect, beforeEach } from "vitest";
import {
  checkCircuitBreaker,
  recordRemediationOutcome,
} from "./remediation-circuit-breaker.js";

function resetCircuitState(): void {
  recordRemediationOutcome(true);
}

describe("remediation-circuit-breaker", () => {
  beforeEach(() => {
    resetCircuitState();
  });

  describe("checkCircuitBreaker", () => {
    it("allows requests when circuit is closed", () => {
      const result = checkCircuitBreaker();
      expect(result).toEqual({ allowed: true });
    });

    it("blocks requests when circuit is open", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);

      const result = checkCircuitBreaker();
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Circuit open/);
      expect(result.reason).toMatch(/3 consecutive/);
    });

    it("includes time-to-reset in reason when circuit is open", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);

      const result = checkCircuitBreaker();
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Resets in \d+ min/);
    });

    it("transitions to half-open after reset period elapses", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);

      expect(checkCircuitBreaker().allowed).toBe(false);

      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + 31 * 60 * 1000;

      try {
        const result = checkCircuitBreaker();
        expect(result).toEqual({ allowed: true });
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe("recordRemediationOutcome", () => {
    it("keeps circuit closed on fewer than threshold failures", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);

      expect(checkCircuitBreaker().allowed).toBe(true);
    });

    it("opens circuit on exactly threshold consecutive failures", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);

      expect(checkCircuitBreaker().allowed).toBe(false);
    });

    it("opens circuit on more than threshold consecutive failures", () => {
      for (let i = 0; i < 5; i++) {
        recordRemediationOutcome(false);
      }

      const result = checkCircuitBreaker();
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/5 consecutive/);
    });

    it("resets failure count on success", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      recordRemediationOutcome(true);

      expect(checkCircuitBreaker().allowed).toBe(true);
    });

    it("closes circuit when success follows open state after half-open", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      expect(checkCircuitBreaker().allowed).toBe(false);

      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + 31 * 60 * 1000;

      try {
        expect(checkCircuitBreaker().allowed).toBe(true);
        recordRemediationOutcome(true);
        expect(checkCircuitBreaker().allowed).toBe(true);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it("re-opens circuit if half-open attempt fails", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);

      const originalDateNow = Date.now;
      const baseTime = originalDateNow();
      Date.now = () => baseTime + 31 * 60 * 1000;

      try {
        checkCircuitBreaker();
        recordRemediationOutcome(false);
        recordRemediationOutcome(false);
        recordRemediationOutcome(false);

        const result = checkCircuitBreaker();
        expect(result.allowed).toBe(false);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it("does not open circuit when failures are non-consecutive", () => {
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);
      recordRemediationOutcome(true);
      recordRemediationOutcome(false);
      recordRemediationOutcome(false);

      expect(checkCircuitBreaker().allowed).toBe(true);
    });
  });
});
