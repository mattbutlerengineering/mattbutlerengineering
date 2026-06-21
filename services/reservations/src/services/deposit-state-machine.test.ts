import { describe, it, expect } from "vitest";
import { depositMachine } from "./deposit-state-machine.js";

/**
 * Domain-rule assertions: verifies the DEPOSIT transition graph is correct.
 * Machine-mechanism tests (TransitionError shape, canTransition, etc.) live in
 * state-machine.test.ts alongside the factory.
 */
describe("deposit state machine — domain rules", () => {
  describe("allowed transitions", () => {
    it("pending -> held is allowed", () => {
      expect(depositMachine.canTransition("pending", "held")).toBe(true);
    });

    it("held -> applied is allowed", () => {
      expect(depositMachine.canTransition("held", "applied")).toBe(true);
    });

    it("held -> refunded is allowed", () => {
      expect(depositMachine.canTransition("held", "refunded")).toBe(true);
    });

    it("held -> forfeited is allowed", () => {
      expect(depositMachine.canTransition("held", "forfeited")).toBe(true);
    });

    it("held -> partial_refunded is allowed", () => {
      expect(depositMachine.canTransition("held", "partial_refunded")).toBe(true);
    });
  });

  describe("disallowed transitions", () => {
    it("pending -> applied is not allowed (must go via held)", () => {
      expect(depositMachine.canTransition("pending", "applied")).toBe(false);
    });

    it("pending -> refunded is not allowed", () => {
      expect(depositMachine.canTransition("pending", "refunded")).toBe(false);
    });

    it("pending -> forfeited is not allowed", () => {
      expect(depositMachine.canTransition("pending", "forfeited")).toBe(false);
    });

    it("held -> pending is not allowed (backward)", () => {
      expect(depositMachine.canTransition("held", "pending")).toBe(false);
    });

    it("applied is a terminal state (no outgoing transitions)", () => {
      expect(depositMachine.allowedTransitions("applied")).toHaveLength(0);
    });

    it("refunded is a terminal state (no outgoing transitions)", () => {
      expect(depositMachine.allowedTransitions("refunded")).toHaveLength(0);
    });

    it("partial_refunded is a terminal state (no outgoing transitions)", () => {
      expect(depositMachine.allowedTransitions("partial_refunded")).toHaveLength(0);
    });

    it("forfeited is a terminal state (no outgoing transitions)", () => {
      expect(depositMachine.allowedTransitions("forfeited")).toHaveLength(0);
    });
  });
});
