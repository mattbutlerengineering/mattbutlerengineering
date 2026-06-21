import { describe, it, expect } from "vitest";
import { reservationMachine } from "./reservation-state-machine.js";

/**
 * Domain-rule assertions: verifies the RESERVATION transition graph is correct.
 * Machine-mechanism tests (TransitionError shape, canTransition, etc.) live in
 * state-machine.test.ts alongside the factory.
 */
describe("reservation state machine — domain rules", () => {
  describe("allowed transitions", () => {
    it("PENDING -> CONFIRMED is allowed", () => {
      expect(reservationMachine.canTransition("PENDING", "CONFIRMED")).toBe(true);
    });

    it("PENDING -> CANCELLED is allowed", () => {
      expect(reservationMachine.canTransition("PENDING", "CANCELLED")).toBe(true);
    });

    it("CONFIRMED -> COMPLETED is allowed", () => {
      expect(reservationMachine.canTransition("CONFIRMED", "COMPLETED")).toBe(true);
    });

    it("CONFIRMED -> CANCELLED is allowed", () => {
      expect(reservationMachine.canTransition("CONFIRMED", "CANCELLED")).toBe(true);
    });

    it("CONFIRMED -> NO_SHOW is allowed", () => {
      expect(reservationMachine.canTransition("CONFIRMED", "NO_SHOW")).toBe(true);
    });
  });

  describe("disallowed transitions", () => {
    it("PENDING -> COMPLETED is not allowed (must go via CONFIRMED)", () => {
      expect(reservationMachine.canTransition("PENDING", "COMPLETED")).toBe(false);
    });

    it("PENDING -> NO_SHOW is not allowed", () => {
      expect(reservationMachine.canTransition("PENDING", "NO_SHOW")).toBe(false);
    });

    it("CONFIRMED -> PENDING is not allowed (backward)", () => {
      expect(reservationMachine.canTransition("CONFIRMED", "PENDING")).toBe(false);
    });

    it("COMPLETED is a terminal state (no outgoing transitions)", () => {
      expect(reservationMachine.allowedTransitions("COMPLETED")).toHaveLength(0);
    });

    it("CANCELLED is a terminal state (no outgoing transitions)", () => {
      expect(reservationMachine.allowedTransitions("CANCELLED")).toHaveLength(0);
    });

    it("NO_SHOW is a terminal state (no outgoing transitions)", () => {
      expect(reservationMachine.allowedTransitions("NO_SHOW")).toHaveLength(0);
    });
  });
});
