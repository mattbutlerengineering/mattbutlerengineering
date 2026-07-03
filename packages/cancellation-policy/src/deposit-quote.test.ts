import { describe, it, expect } from "vitest";
import { quoteDeposit } from "./deposit-quote.js";
import type { DepositQuoteConfig } from "./deposit-quote.js";

describe("quoteDeposit", () => {
  it.each<[string, DepositQuoteConfig, number, number]>([
    ["per_person: single guest", { depositType: "per_person", amountCents: 1000 }, 1, 1000],
    ["per_person: multiple guests", { depositType: "per_person", amountCents: 1000 }, 4, 4000],
    ["per_person: large party", { depositType: "per_person", amountCents: 500 }, 100, 50000],
    [
      "per_person: zero party size is a zero deposit, not an error",
      { depositType: "per_person", amountCents: 1000 },
      0,
      0,
    ],
    [
      "per_person: null amountCents means no deposit configured",
      { depositType: "per_person", amountCents: null },
      3,
      0,
    ],
    [
      "flat: amount is unchanged regardless of party size",
      { depositType: "flat", amountCents: 5000 },
      4,
      5000,
    ],
    ["flat: single guest", { depositType: "flat", amountCents: 5000 }, 1, 5000],
    [
      "flat: null amountCents means no deposit configured",
      { depositType: "flat", amountCents: null },
      3,
      0,
    ],
    [
      "no type recorded (null) behaves like flat",
      { depositType: null, amountCents: 5000 },
      4,
      5000,
    ],
    [
      "rounding: integer inputs never introduce fractional cents",
      { depositType: "per_person", amountCents: 333 },
      3,
      999,
    ],
  ])("%s", (_label, config, partySize, expectedCents) => {
    expect(quoteDeposit(config, partySize)).toBe(expectedCents);
  });

  it("throws when amountCents is negative", () => {
    expect(() => quoteDeposit({ depositType: "flat", amountCents: -100 }, 4)).toThrow(/negative/i);
  });

  it("throws when partySize is negative", () => {
    expect(() => quoteDeposit({ depositType: "per_person", amountCents: 1000 }, -1)).toThrow(
      /negative/i
    );
  });
});
