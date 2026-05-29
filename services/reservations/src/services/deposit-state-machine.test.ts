import { describe, it, expect } from "vitest";
import {
  transitionDeposit,
  isValidTransition,
  VALID_TRANSITIONS,
  DepositTransitionError,
} from "./deposit-state-machine.js";
import type { DepositStatus } from "../generated/prisma/index.js";

describe("deposit state machine", () => {
  describe("VALID_TRANSITIONS map", () => {
    it("lists pending -> held as valid", () => {
      expect(VALID_TRANSITIONS.pending).toContain("held");
    });

    it("lists held -> applied as valid", () => {
      expect(VALID_TRANSITIONS.held).toContain("applied");
    });

    it("lists held -> refunded as valid", () => {
      expect(VALID_TRANSITIONS.held).toContain("refunded");
    });

    it("lists held -> forfeited as valid", () => {
      expect(VALID_TRANSITIONS.held).toContain("forfeited");
    });

    it("lists no valid transitions from applied (terminal state)", () => {
      expect(VALID_TRANSITIONS.applied).toHaveLength(0);
    });

    it("lists no valid transitions from refunded (terminal state)", () => {
      expect(VALID_TRANSITIONS.refunded).toHaveLength(0);
    });

    it("lists no valid transitions from forfeited (terminal state)", () => {
      expect(VALID_TRANSITIONS.forfeited).toHaveLength(0);
    });
  });

  describe("isValidTransition", () => {
    it("returns true for pending -> held", () => {
      expect(isValidTransition("pending", "held")).toBe(true);
    });

    it("returns true for held -> applied", () => {
      expect(isValidTransition("held", "applied")).toBe(true);
    });

    it("returns true for held -> refunded", () => {
      expect(isValidTransition("held", "refunded")).toBe(true);
    });

    it("returns true for held -> forfeited", () => {
      expect(isValidTransition("held", "forfeited")).toBe(true);
    });

    it("returns false for pending -> applied (skipping held)", () => {
      expect(isValidTransition("pending", "applied")).toBe(false);
    });

    it("returns false for pending -> refunded", () => {
      expect(isValidTransition("pending", "refunded")).toBe(false);
    });

    it("returns false for pending -> forfeited", () => {
      expect(isValidTransition("pending", "forfeited")).toBe(false);
    });

    it("returns false for applied -> refunded (terminal)", () => {
      expect(isValidTransition("applied", "refunded")).toBe(false);
    });

    it("returns false for refunded -> applied (terminal)", () => {
      expect(isValidTransition("refunded", "applied")).toBe(false);
    });

    it("returns false for forfeited -> applied (terminal)", () => {
      expect(isValidTransition("forfeited", "applied")).toBe(false);
    });

    it("returns false for held -> pending (backward)", () => {
      expect(isValidTransition("held", "pending")).toBe(false);
    });
  });

  describe("transitionDeposit", () => {
    it("returns new status on valid pending -> held", () => {
      const result = transitionDeposit("pending", "held");
      expect(result).toBe("held");
    });

    it("returns new status on valid held -> applied", () => {
      const result = transitionDeposit("held", "applied");
      expect(result).toBe("applied");
    });

    it("returns new status on valid held -> refunded", () => {
      const result = transitionDeposit("held", "refunded");
      expect(result).toBe("refunded");
    });

    it("returns new status on valid held -> forfeited", () => {
      const result = transitionDeposit("held", "forfeited");
      expect(result).toBe("forfeited");
    });

    it("throws DepositTransitionError on invalid pending -> applied", () => {
      expect(() => transitionDeposit("pending", "applied")).toThrow(DepositTransitionError);
    });

    it("throws DepositTransitionError on invalid pending -> refunded", () => {
      expect(() => transitionDeposit("pending", "refunded")).toThrow(DepositTransitionError);
    });

    it("throws DepositTransitionError on invalid pending -> forfeited", () => {
      expect(() => transitionDeposit("pending", "forfeited")).toThrow(DepositTransitionError);
    });

    it("throws DepositTransitionError on forfeited -> applied", () => {
      expect(() => transitionDeposit("forfeited", "applied")).toThrow(DepositTransitionError);
    });

    it("throws DepositTransitionError on applied -> refunded", () => {
      expect(() => transitionDeposit("applied", "refunded")).toThrow(DepositTransitionError);
    });

    it("throws DepositTransitionError on refunded -> forfeited", () => {
      expect(() => transitionDeposit("refunded", "forfeited")).toThrow(DepositTransitionError);
    });

    it("error message includes from/to states", () => {
      expect(() => transitionDeposit("forfeited", "applied")).toThrow(
        /forfeited.*applied|applied.*forfeited/i
      );
    });

    it("DepositTransitionError has from and to properties", () => {
      try {
        transitionDeposit("forfeited", "applied");
        // should not reach here
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DepositTransitionError);
        const depositErr = err as DepositTransitionError;
        expect(depositErr.from).toBe("forfeited" as DepositStatus);
        expect(depositErr.to).toBe("applied" as DepositStatus);
      }
    });
  });
});
