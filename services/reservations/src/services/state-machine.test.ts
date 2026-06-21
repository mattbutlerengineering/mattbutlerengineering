import { describe, it, expect } from "vitest";
import { createStateMachine, TransitionError } from "./state-machine.js";

describe("createStateMachine", () => {
  const machine = createStateMachine<"a" | "b" | "c">({
    a: ["b"],
    b: ["c"],
    c: [],
  });

  describe("transition", () => {
    it("succeeds for a valid transition", () => {
      expect(() => machine.transition("a", "b")).not.toThrow();
    });

    it("throws TransitionError for an invalid transition", () => {
      expect(() => machine.transition("a", "c")).toThrow(TransitionError);
    });

    it("throws TransitionError from a terminal state", () => {
      expect(() => machine.transition("c", "a")).toThrow(TransitionError);
    });

    it("error carries correct from and to properties", () => {
      try {
        machine.transition("a", "c");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TransitionError);
        const te = err as TransitionError;
        expect(te.from).toBe("a");
        expect(te.to).toBe("c");
      }
    });

    it("error message includes from, to, and allowed states", () => {
      expect(() => machine.transition("a", "c")).toThrow(/a.*c|c.*a/i);
    });

    it("error carries correct allowed list", () => {
      try {
        machine.transition("a", "c");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TransitionError);
        const te = err as TransitionError;
        expect(te.allowed).toEqual(["b"]);
      }
    });
  });

  describe("canTransition", () => {
    it("returns true for a valid transition", () => {
      expect(machine.canTransition("a", "b")).toBe(true);
    });

    it("returns false for an invalid transition", () => {
      expect(machine.canTransition("a", "c")).toBe(false);
    });

    it("returns false from a terminal state", () => {
      expect(machine.canTransition("c", "a")).toBe(false);
    });

    it("returns true for each edge in the graph", () => {
      expect(machine.canTransition("b", "c")).toBe(true);
    });
  });

  describe("allowedTransitions", () => {
    it("returns the allowed states from a given state", () => {
      expect(machine.allowedTransitions("a")).toEqual(["b"]);
    });

    it("returns an empty array from a terminal state", () => {
      expect(machine.allowedTransitions("c")).toEqual([]);
    });

    it("returns multiple allowed targets when present", () => {
      const m = createStateMachine<"x" | "y" | "z">({ x: ["y", "z"], y: [], z: [] });
      expect(m.allowedTransitions("x")).toEqual(["y", "z"]);
    });
  });

  describe("entityType label", () => {
    it("includes the entityType in the error message when provided", () => {
      const labeled = createStateMachine<"a" | "b">({ a: ["b"], b: [] }, "deposit");
      expect(() => labeled.transition("b", "a")).toThrow(/deposit/i);
    });

    it("TransitionError.entityType is set when provided", () => {
      const labeled = createStateMachine<"a" | "b">({ a: ["b"], b: [] }, "reservation");
      try {
        labeled.transition("b", "a");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TransitionError);
        expect((err as TransitionError).entityType).toBe("reservation");
      }
    });

    it("TransitionError.entityType is undefined when not provided", () => {
      try {
        machine.transition("a", "c");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TransitionError);
        expect((err as TransitionError).entityType).toBeUndefined();
      }
    });
  });
});
