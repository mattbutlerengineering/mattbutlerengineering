import { describe, it, expect } from "vitest";
import {
  WIZARD_STEPS,
  LAST_STEP_INDEX,
  ROOMS,
  INITIAL_WIZARD_STATE,
  nightsBetween,
  nextIsoDay,
  validateDates,
  validateRoom,
  validateGuest,
  validatePayment,
  validateStep,
  isStepComplete,
  attemptAdvance,
  goBack,
  priceBreakdown,
  maskCardNumber,
  type BookingWizardState,
} from "./booking-wizard.js";

/** A fully-valid state, from which each test peels away one field. */
function completeState(): BookingWizardState {
  return {
    checkIn: "2026-08-01",
    checkOut: "2026-08-04",
    roomId: "harbor-king",
    guest: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "555-0100",
    },
    payment: {
      cardName: "Ada Lovelace",
      cardNumber: "4242 4242 4242 4242",
      expiry: "08/28",
      cvc: "123",
    },
  };
}

describe("WIZARD_STEPS", () => {
  it("declares exactly five steps in domain order", () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual([
      "dates",
      "room",
      "guest",
      "payment",
      "confirmation",
    ]);
  });

  it("LAST_STEP_INDEX points at the confirmation step", () => {
    expect(LAST_STEP_INDEX).toBe(4);
    expect(WIZARD_STEPS[LAST_STEP_INDEX]!.id).toBe("confirmation");
  });
});

describe("nightsBetween", () => {
  it("counts nights for an ordered range", () => {
    expect(nightsBetween("2026-08-01", "2026-08-04")).toBe(3);
  });

  it("returns 0 for equal, reversed, missing, or malformed dates", () => {
    expect(nightsBetween("2026-08-01", "2026-08-01")).toBe(0);
    expect(nightsBetween("2026-08-04", "2026-08-01")).toBe(0);
    expect(nightsBetween(null, "2026-08-04")).toBe(0);
    expect(nightsBetween("2026-08-01", null)).toBe(0);
    expect(nightsBetween("not-a-date", "2026-08-04")).toBe(0);
  });
});

describe("nextIsoDay", () => {
  it("returns the following calendar day", () => {
    expect(nextIsoDay("2026-08-01")).toBe("2026-08-02");
    expect(nextIsoDay("2026-08-31")).toBe("2026-09-01");
  });

  it("returns undefined for unset or malformed input", () => {
    expect(nextIsoDay(null)).toBeUndefined();
    expect(nextIsoDay("nope")).toBeUndefined();
  });
});

describe("validateDates", () => {
  it("passes for an ordered pair", () => {
    expect(validateDates(completeState())).toEqual({});
  });

  it("flags missing dates", () => {
    const errors = validateDates(INITIAL_WIZARD_STATE);
    expect(errors.checkIn).toBeDefined();
    expect(errors.checkOut).toBeDefined();
  });

  it("requires check-out to be after check-in", () => {
    const state = { ...completeState(), checkOut: "2026-08-01" };
    expect(validateDates(state).checkOut).toMatch(/after check-in/i);
  });
});

describe("validateRoom", () => {
  it("passes when a room is chosen", () => {
    expect(validateRoom(completeState())).toEqual({});
  });

  it("flags an unselected room", () => {
    expect(validateRoom({ ...completeState(), roomId: null }).roomId).toBeDefined();
  });
});

describe("validateGuest", () => {
  it("passes for a complete guest", () => {
    expect(validateGuest(completeState())).toEqual({});
  });

  it("requires first name, last name, and email", () => {
    const errors = validateGuest({
      ...completeState(),
      guest: { firstName: " ", lastName: "", email: "", phone: "" },
    });
    expect(errors.firstName).toBeDefined();
    expect(errors.lastName).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it("rejects a malformed email", () => {
    const errors = validateGuest({
      ...completeState(),
      guest: { ...completeState().guest, email: "not-an-email" },
    });
    expect(errors.email).toMatch(/valid email/i);
  });
});

describe("validatePayment", () => {
  it("passes for well-formed mock card details", () => {
    expect(validatePayment(completeState())).toEqual({});
  });

  it("rejects short card numbers, bad expiry, and short cvc", () => {
    const errors = validatePayment({
      ...completeState(),
      payment: { cardName: "", cardNumber: "4242", expiry: "13/28", cvc: "1" },
    });
    expect(errors.cardName).toBeDefined();
    expect(errors.cardNumber).toBeDefined();
    expect(errors.expiry).toBeDefined();
    expect(errors.cvc).toBeDefined();
  });
});

describe("validateStep / isStepComplete", () => {
  it("routes each step index to its validator", () => {
    const state = completeState();
    for (let i = 0; i <= LAST_STEP_INDEX; i++) {
      expect(isStepComplete(i, state)).toBe(true);
    }
  });

  it("confirmation step is always complete", () => {
    expect(validateStep(LAST_STEP_INDEX, INITIAL_WIZARD_STATE)).toEqual({});
  });
});

describe("attemptAdvance", () => {
  it("advances when the current step validates", () => {
    const result = attemptAdvance(0, completeState());
    expect(result).toEqual({ step: 1, errors: {}, advanced: true });
  });

  it("blocks advance and returns errors when the step is invalid", () => {
    const result = attemptAdvance(0, INITIAL_WIZARD_STATE);
    expect(result.advanced).toBe(false);
    expect(result.step).toBe(0);
    expect(Object.keys(result.errors).length).toBeGreaterThan(0);
  });

  it("never advances past the confirmation step", () => {
    const result = attemptAdvance(LAST_STEP_INDEX, completeState());
    expect(result.step).toBe(LAST_STEP_INDEX);
    expect(result.advanced).toBe(false);
  });
});

describe("goBack", () => {
  it("moves back one step", () => {
    expect(goBack(3)).toBe(2);
  });

  it("clamps at the first step", () => {
    expect(goBack(0)).toBe(0);
  });
});

describe("priceBreakdown", () => {
  it("computes subtotal, taxes, and total for a chosen room and stay", () => {
    const room = ROOMS.find((r) => r.id === "harbor-king")!;
    const breakdown = priceBreakdown(completeState())!;
    expect(breakdown.nights).toBe(3);
    expect(breakdown.ratePerNight).toBe(room.pricePerNight);
    expect(breakdown.subtotal).toBe(room.pricePerNight * 3);
    expect(breakdown.total).toBe(breakdown.subtotal + breakdown.taxes);
  });

  it("returns null without a room or a valid stay", () => {
    expect(priceBreakdown({ ...completeState(), roomId: null })).toBeNull();
    expect(priceBreakdown({ ...completeState(), checkOut: null })).toBeNull();
  });
});

describe("maskCardNumber", () => {
  it("shows only the last four digits", () => {
    expect(maskCardNumber("4242 4242 4242 4242")).toBe("•••• •••• •••• 4242");
  });

  it("falls back to a bullet group for too-short input", () => {
    expect(maskCardNumber("12")).toBe("••••");
  });
});
