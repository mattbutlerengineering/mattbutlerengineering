import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  describeDepositCancellation,
  useDepositCancellationTerms,
} from "./formatDepositCancellationTerms.js";
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

function terms(config: DepositConfig | null, partySize: number): string | null {
  return renderHook(() => useDepositCancellationTerms(config, partySize)).result.current;
}

describe("describeDepositCancellation", () => {
  it("returns null when config is null", () => {
    expect(describeDepositCancellation(null, 2)).toBeNull();
  });

  it("returns null when freeCancellationHours is null (no policy)", () => {
    expect(describeDepositCancellation(makeConfig({ freeCancellationHours: null }), 2)).toBeNull();
  });

  it("computes fees from the per_person TOTAL (base × partySize), not the base", () => {
    const d = describeDepositCancellation(
      makeConfig({ depositType: "per_person", amountCents: 1000, lateCancellationFeePercent: 50 }),
      4
    );
    expect(d?.lateFeeAmountCents).toBe(2000);
  });
});

describe("useDepositCancellationTerms", () => {
  it("returns null when there is no policy", () => {
    expect(terms(null, 2)).toBeNull();
  });

  it("includes the fee percent AND the fee amount", () => {
    const result = terms(makeConfig(), 2);
    expect(result).toContain("24 hours");
    expect(result).toContain("50%");
    expect(result).toContain("$50.00");
  });

  it("says 'hour' for a one-hour window", () => {
    expect(terms(makeConfig({ freeCancellationHours: 1 }), 2)).toContain("up to 1 hour before");
  });

  it("floors fractional cents", () => {
    // 33% of $9.99 = 329.67 cents → floor 329 → $3.29
    expect(terms(makeConfig({ amountCents: 999, lateCancellationFeePercent: 33 }), 1)).toContain(
      "$3.29"
    );
  });

  it("shows $0.00 when there is no late fee percent", () => {
    const result = terms(makeConfig({ lateCancellationFeePercent: null }), 1);
    expect(result).toContain("0%");
    expect(result).toContain("$0.00");
  });

  it("mentions the no-show term with a 100% default when noShowFeePercent is null", () => {
    const result = terms(makeConfig({ noShowFeePercent: null }), 1);
    expect(result).toContain("no-show");
    expect(result).toContain("100%");
  });

  it("formats fees in the deposit's currency", () => {
    expect(terms(makeConfig({ currency: "cad" }), 1)).toContain("CA$50.00");
  });
});
