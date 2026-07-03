import { describe, it, expect } from "vitest";
import { formatDepositCancellationTerms } from "./formatDepositCancellationTerms.js";
import type { DepositConfig } from "@mbe/types";

function makeConfig(overrides: Partial<DepositConfig> = {}): DepositConfig {
  return {
    enabled: true,
    depositType: "flat",
    amountCents: 10000, // $100.00
    currency: "usd",
    freeCancellationHours: 24,
    lateCancellationFeePercent: 50,
    noShowFeePercent: 100,
    ...overrides,
  };
}

describe("formatDepositCancellationTerms", () => {
  it("returns null when config is null", () => {
    expect(formatDepositCancellationTerms(null, 2)).toBeNull();
  });

  it("returns null when freeCancellationHours is null (no policy)", () => {
    expect(
      formatDepositCancellationTerms(makeConfig({ freeCancellationHours: null }), 2)
    ).toBeNull();
  });

  it("includes the fee percent AND the fee dollar amount", () => {
    const result = formatDepositCancellationTerms(makeConfig(), 2);
    expect(result).toContain("24 hours");
    expect(result).toContain("50%");
    // The AC: "a [amount] fee applies" — fee = 50% of $100 = $50.00
    expect(result).toContain("$50.00");
  });

  it("computes the fee amount from amountCents and floors fractional cents", () => {
    const result = formatDepositCancellationTerms(
      makeConfig({ amountCents: 999, lateCancellationFeePercent: 33 }),
      1
    );
    // 33% of $9.99 = 329.67 cents → floor 329 → $3.29
    expect(result).toContain("$3.29");
  });

  it("shows $0.00 when there is no late fee percent", () => {
    const result = formatDepositCancellationTerms(
      makeConfig({ lateCancellationFeePercent: null }),
      1
    );
    expect(result).toContain("0%");
    expect(result).toContain("$0.00");
  });

  it("computes the late fee from the per_person TOTAL (base × partySize), not the base", () => {
    // per_person, $10/guest, party of 4 → total deposit = $40.00; 50% late fee = $20.00
    const result = formatDepositCancellationTerms(
      makeConfig({ depositType: "per_person", amountCents: 1000, lateCancellationFeePercent: 50 }),
      4
    );
    expect(result).toContain("$20.00");
    expect(result).not.toContain("$5.00");
  });

  it("mentions the no-show term when noShowFeePercent is set", () => {
    const result = formatDepositCancellationTerms(makeConfig({ noShowFeePercent: 75 }), 1);
    expect(result).toContain("no-show");
    expect(result).toContain("75%");
  });

  it("mentions the no-show term with a 100% default when noShowFeePercent is null", () => {
    const result = formatDepositCancellationTerms(makeConfig({ noShowFeePercent: null }), 1);
    expect(result).toContain("no-show");
    expect(result).toContain("100%");
  });
});
