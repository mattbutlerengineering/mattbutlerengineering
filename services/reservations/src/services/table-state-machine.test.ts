import { describe, it, expect } from "vitest";
import { tableMachine } from "./table-state-machine.js";

/**
 * Domain-rule assertions: verifies the TABLE transition graph is correct.
 * Machine-mechanism tests (TransitionError shape, canTransition, etc.) live in
 * state-machine.test.ts alongside the factory.
 */
describe("table state machine — domain rules", () => {
  describe("allowed transitions", () => {
    it("AVAILABLE -> OCCUPIED is allowed", () => {
      expect(tableMachine.canTransition("AVAILABLE", "OCCUPIED")).toBe(true);
    });

    it("OCCUPIED -> DIRTY is allowed", () => {
      expect(tableMachine.canTransition("OCCUPIED", "DIRTY")).toBe(true);
    });

    it("DIRTY -> READY is allowed", () => {
      expect(tableMachine.canTransition("DIRTY", "READY")).toBe(true);
    });

    it("READY -> AVAILABLE is allowed (cycle reset)", () => {
      expect(tableMachine.canTransition("READY", "AVAILABLE")).toBe(true);
    });
  });

  describe("disallowed transitions", () => {
    it("AVAILABLE -> DIRTY is not allowed (skipping OCCUPIED)", () => {
      expect(tableMachine.canTransition("AVAILABLE", "DIRTY")).toBe(false);
    });

    it("AVAILABLE -> READY is not allowed (skipping steps)", () => {
      expect(tableMachine.canTransition("AVAILABLE", "READY")).toBe(false);
    });

    it("AVAILABLE -> AVAILABLE is not allowed (self-transition)", () => {
      expect(tableMachine.canTransition("AVAILABLE", "AVAILABLE")).toBe(false);
    });

    it("OCCUPIED -> AVAILABLE is not allowed (backward)", () => {
      expect(tableMachine.canTransition("OCCUPIED", "AVAILABLE")).toBe(false);
    });

    it("DIRTY -> AVAILABLE is not allowed (skipping READY)", () => {
      expect(tableMachine.canTransition("DIRTY", "AVAILABLE")).toBe(false);
    });

    it("READY -> DIRTY is not allowed (backward)", () => {
      expect(tableMachine.canTransition("READY", "DIRTY")).toBe(false);
    });
  });
});
