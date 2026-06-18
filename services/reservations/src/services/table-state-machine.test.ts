import { describe, it, expect } from "vitest";
import {
  TABLE_VALID_TRANSITIONS,
  isValidTableTransition,
  transitionTable,
  TableTransitionError,
} from "./table-state-machine.js";
import type { TableStatus } from "../generated/prisma/index.js";

describe("table state machine", () => {
  describe("TABLE_VALID_TRANSITIONS map", () => {
    it("lists AVAILABLE -> OCCUPIED as valid", () => {
      expect(TABLE_VALID_TRANSITIONS.AVAILABLE).toContain("OCCUPIED");
    });

    it("lists only OCCUPIED as valid transition from AVAILABLE", () => {
      expect(TABLE_VALID_TRANSITIONS.AVAILABLE).toHaveLength(1);
    });

    it("lists OCCUPIED -> DIRTY as valid", () => {
      expect(TABLE_VALID_TRANSITIONS.OCCUPIED).toContain("DIRTY");
    });

    it("lists only DIRTY as valid transition from OCCUPIED", () => {
      expect(TABLE_VALID_TRANSITIONS.OCCUPIED).toHaveLength(1);
    });

    it("lists DIRTY -> READY as valid", () => {
      expect(TABLE_VALID_TRANSITIONS.DIRTY).toContain("READY");
    });

    it("lists only READY as valid transition from DIRTY", () => {
      expect(TABLE_VALID_TRANSITIONS.DIRTY).toHaveLength(1);
    });

    it("lists READY -> AVAILABLE as valid", () => {
      expect(TABLE_VALID_TRANSITIONS.READY).toContain("AVAILABLE");
    });

    it("lists only AVAILABLE as valid transition from READY", () => {
      expect(TABLE_VALID_TRANSITIONS.READY).toHaveLength(1);
    });
  });

  describe("isValidTableTransition", () => {
    it("returns true for AVAILABLE -> OCCUPIED", () => {
      expect(isValidTableTransition("AVAILABLE", "OCCUPIED")).toBe(true);
    });

    it("returns true for OCCUPIED -> DIRTY", () => {
      expect(isValidTableTransition("OCCUPIED", "DIRTY")).toBe(true);
    });

    it("returns true for DIRTY -> READY", () => {
      expect(isValidTableTransition("DIRTY", "READY")).toBe(true);
    });

    it("returns true for READY -> AVAILABLE", () => {
      expect(isValidTableTransition("READY", "AVAILABLE")).toBe(true);
    });

    it("returns false for AVAILABLE -> DIRTY (skipping OCCUPIED)", () => {
      expect(isValidTableTransition("AVAILABLE", "DIRTY")).toBe(false);
    });

    it("returns false for AVAILABLE -> READY (skipping)", () => {
      expect(isValidTableTransition("AVAILABLE", "READY")).toBe(false);
    });

    it("returns false for AVAILABLE -> AVAILABLE (self-transition)", () => {
      expect(isValidTableTransition("AVAILABLE", "AVAILABLE")).toBe(false);
    });

    it("returns false for OCCUPIED -> AVAILABLE (backward)", () => {
      expect(isValidTableTransition("OCCUPIED", "AVAILABLE")).toBe(false);
    });

    it("returns false for DIRTY -> AVAILABLE (skipping READY)", () => {
      expect(isValidTableTransition("DIRTY", "AVAILABLE")).toBe(false);
    });

    it("returns false for READY -> DIRTY (backward)", () => {
      expect(isValidTableTransition("READY", "DIRTY")).toBe(false);
    });
  });

  describe("transitionTable", () => {
    it("returns new status on valid AVAILABLE -> OCCUPIED", () => {
      const result = transitionTable("AVAILABLE", "OCCUPIED");
      expect(result).toBe("OCCUPIED");
    });

    it("returns new status on valid OCCUPIED -> DIRTY", () => {
      const result = transitionTable("OCCUPIED", "DIRTY");
      expect(result).toBe("DIRTY");
    });

    it("returns new status on valid DIRTY -> READY", () => {
      const result = transitionTable("DIRTY", "READY");
      expect(result).toBe("READY");
    });

    it("returns new status on valid READY -> AVAILABLE", () => {
      const result = transitionTable("READY", "AVAILABLE");
      expect(result).toBe("AVAILABLE");
    });

    it("throws TableTransitionError on invalid AVAILABLE -> DIRTY", () => {
      expect(() => transitionTable("AVAILABLE", "DIRTY")).toThrow(TableTransitionError);
    });

    it("throws TableTransitionError on invalid AVAILABLE -> READY", () => {
      expect(() => transitionTable("AVAILABLE", "READY")).toThrow(TableTransitionError);
    });

    it("throws TableTransitionError on invalid OCCUPIED -> AVAILABLE (backward)", () => {
      expect(() => transitionTable("OCCUPIED", "AVAILABLE")).toThrow(TableTransitionError);
    });

    it("throws TableTransitionError on invalid DIRTY -> OCCUPIED (backward)", () => {
      expect(() => transitionTable("DIRTY", "OCCUPIED")).toThrow(TableTransitionError);
    });

    it("error message includes from/to states", () => {
      expect(() => transitionTable("AVAILABLE", "DIRTY")).toThrow(
        /AVAILABLE.*DIRTY|DIRTY.*AVAILABLE/i
      );
    });

    it("TableTransitionError has from and to properties", () => {
      try {
        transitionTable("AVAILABLE", "DIRTY");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TableTransitionError);
        const tableErr = err as TableTransitionError;
        expect(tableErr.from).toBe("AVAILABLE" as TableStatus);
        expect(tableErr.to).toBe("DIRTY" as TableStatus);
      }
    });
  });
});
