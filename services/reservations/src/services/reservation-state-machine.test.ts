import { describe, it, expect } from "vitest";
import {
  transitionReservation,
  isValidReservationTransition,
  RESERVATION_VALID_TRANSITIONS,
  ReservationTransitionError,
} from "./reservation-state-machine.js";
import type { ReservationStatus } from "@mbe/types";

describe("reservation state machine", () => {
  describe("RESERVATION_VALID_TRANSITIONS map", () => {
    it("lists PENDING -> CONFIRMED as valid", () => {
      expect(RESERVATION_VALID_TRANSITIONS.PENDING).toContain("CONFIRMED");
    });

    it("lists PENDING -> CANCELLED as valid", () => {
      expect(RESERVATION_VALID_TRANSITIONS.PENDING).toContain("CANCELLED");
    });

    it("lists CONFIRMED -> COMPLETED as valid", () => {
      expect(RESERVATION_VALID_TRANSITIONS.CONFIRMED).toContain("COMPLETED");
    });

    it("lists CONFIRMED -> CANCELLED as valid", () => {
      expect(RESERVATION_VALID_TRANSITIONS.CONFIRMED).toContain("CANCELLED");
    });

    it("lists CONFIRMED -> NO_SHOW as valid", () => {
      expect(RESERVATION_VALID_TRANSITIONS.CONFIRMED).toContain("NO_SHOW");
    });

    it("lists no valid transitions from COMPLETED (terminal state)", () => {
      expect(RESERVATION_VALID_TRANSITIONS.COMPLETED).toHaveLength(0);
    });

    it("lists no valid transitions from CANCELLED (terminal state)", () => {
      expect(RESERVATION_VALID_TRANSITIONS.CANCELLED).toHaveLength(0);
    });

    it("lists no valid transitions from NO_SHOW (terminal state)", () => {
      expect(RESERVATION_VALID_TRANSITIONS.NO_SHOW).toHaveLength(0);
    });
  });

  describe("isValidReservationTransition", () => {
    it("returns true for PENDING -> CONFIRMED", () => {
      expect(isValidReservationTransition("PENDING", "CONFIRMED")).toBe(true);
    });

    it("returns true for PENDING -> CANCELLED", () => {
      expect(isValidReservationTransition("PENDING", "CANCELLED")).toBe(true);
    });

    it("returns true for CONFIRMED -> COMPLETED", () => {
      expect(isValidReservationTransition("CONFIRMED", "COMPLETED")).toBe(true);
    });

    it("returns true for CONFIRMED -> CANCELLED", () => {
      expect(isValidReservationTransition("CONFIRMED", "CANCELLED")).toBe(true);
    });

    it("returns true for CONFIRMED -> NO_SHOW", () => {
      expect(isValidReservationTransition("CONFIRMED", "NO_SHOW")).toBe(true);
    });

    it("returns false for PENDING -> COMPLETED (skipping CONFIRMED)", () => {
      expect(isValidReservationTransition("PENDING", "COMPLETED")).toBe(false);
    });

    it("returns false for PENDING -> NO_SHOW", () => {
      expect(isValidReservationTransition("PENDING", "NO_SHOW")).toBe(false);
    });

    it("returns false for COMPLETED -> PENDING (terminal)", () => {
      expect(isValidReservationTransition("COMPLETED", "PENDING")).toBe(false);
    });

    it("returns false for COMPLETED -> CONFIRMED (terminal)", () => {
      expect(isValidReservationTransition("COMPLETED", "CONFIRMED")).toBe(false);
    });

    it("returns false for COMPLETED -> CANCELLED (terminal)", () => {
      expect(isValidReservationTransition("COMPLETED", "CANCELLED")).toBe(false);
    });

    it("returns false for CANCELLED -> PENDING (terminal)", () => {
      expect(isValidReservationTransition("CANCELLED", "PENDING")).toBe(false);
    });

    it("returns false for CANCELLED -> CONFIRMED (terminal)", () => {
      expect(isValidReservationTransition("CANCELLED", "CONFIRMED")).toBe(false);
    });

    it("returns false for NO_SHOW -> PENDING (terminal)", () => {
      expect(isValidReservationTransition("NO_SHOW", "PENDING")).toBe(false);
    });

    it("returns false for CONFIRMED -> PENDING (backward)", () => {
      expect(isValidReservationTransition("CONFIRMED", "PENDING")).toBe(false);
    });
  });

  describe("transitionReservation", () => {
    it("returns new status on valid PENDING -> CONFIRMED", () => {
      const result = transitionReservation("PENDING", "CONFIRMED");
      expect(result).toBe("CONFIRMED");
    });

    it("returns new status on valid PENDING -> CANCELLED", () => {
      const result = transitionReservation("PENDING", "CANCELLED");
      expect(result).toBe("CANCELLED");
    });

    it("returns new status on valid CONFIRMED -> COMPLETED", () => {
      const result = transitionReservation("CONFIRMED", "COMPLETED");
      expect(result).toBe("COMPLETED");
    });

    it("returns new status on valid CONFIRMED -> CANCELLED", () => {
      const result = transitionReservation("CONFIRMED", "CANCELLED");
      expect(result).toBe("CANCELLED");
    });

    it("returns new status on valid CONFIRMED -> NO_SHOW", () => {
      const result = transitionReservation("CONFIRMED", "NO_SHOW");
      expect(result).toBe("NO_SHOW");
    });

    it("throws ReservationTransitionError on invalid PENDING -> COMPLETED", () => {
      expect(() => transitionReservation("PENDING", "COMPLETED")).toThrow(
        ReservationTransitionError
      );
    });

    it("throws ReservationTransitionError on invalid PENDING -> NO_SHOW", () => {
      expect(() => transitionReservation("PENDING", "NO_SHOW")).toThrow(ReservationTransitionError);
    });

    it("throws ReservationTransitionError on COMPLETED -> PENDING (terminal)", () => {
      expect(() => transitionReservation("COMPLETED", "PENDING")).toThrow(
        ReservationTransitionError
      );
    });

    it("throws ReservationTransitionError on CANCELLED -> CONFIRMED (terminal)", () => {
      expect(() => transitionReservation("CANCELLED", "CONFIRMED")).toThrow(
        ReservationTransitionError
      );
    });

    it("throws ReservationTransitionError on NO_SHOW -> PENDING (terminal)", () => {
      expect(() => transitionReservation("NO_SHOW", "PENDING")).toThrow(ReservationTransitionError);
    });

    it("error message includes from/to states", () => {
      expect(() => transitionReservation("COMPLETED", "PENDING")).toThrow(
        /COMPLETED.*PENDING|PENDING.*COMPLETED/i
      );
    });

    it("ReservationTransitionError has from and to properties", () => {
      try {
        transitionReservation("COMPLETED", "PENDING");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ReservationTransitionError);
        const transitionErr = err as ReservationTransitionError;
        expect(transitionErr.from).toBe("COMPLETED" as ReservationStatus);
        expect(transitionErr.to).toBe("PENDING" as ReservationStatus);
      }
    });
  });
});
