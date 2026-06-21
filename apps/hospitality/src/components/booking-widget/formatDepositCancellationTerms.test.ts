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
    expect(formatDepositCancellationTerms(null)).toBeNull();
  });

  it("returns null when freeCancellationHours is null (no policy)", () => {
    expect(formatDepositCancellationTerms(makeConfig({ freeCancellationHours: null }))).toBeNull();
  });

  it("includes the fee percent AND the fee dollar amount", () => {
    const result = formatDepositCancellationTerms(makeConfig());
    expect(result).toContain("24 hours");
    expect(result).toContain("50%");
    // The AC: "a [amount] fee applies" — fee = 50% of $100 = $50.00
    expect(result).toContain("$50.00");
  });

  it("computes the fee amount from amountCents and floors fractional cents", () => {
    const result = formatDepositCancellationTerms(
      makeConfig({ amountCents: 999, lateCancellationFeePercent: 33 })
    );
    // 33% of $9.99 = 329.67 cents → floor 329 → $3.29
    expect(result).toContain("$3.29");
  });

  it("shows $0.00 when there is no late fee percent", () => {
    const result = formatDepositCancellationTerms(makeConfig({ lateCancellationFeePercent: null }));
    expect(result).toContain("0%");
    expect(result).toContain("$0.00");
  });
});
