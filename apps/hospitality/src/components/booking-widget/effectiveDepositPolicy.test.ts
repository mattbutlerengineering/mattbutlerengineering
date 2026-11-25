import { describe, it, expect } from "vitest";
import { effectiveDepositPolicy, provisionalDepositRequired } from "./effectiveDepositPolicy.js";
import type { DepositConfig } from "@mbe/types";

function makeConfig(overrides: Partial<DepositConfig> = {}): DepositConfig {
  return {
    enabled: true,
    depositType: "flat",
    amountCents: 5000,
    currency: "usd",
    freeCancellationHours: 24,
    lateCancellationFeePercent: 50,
    noShowFeePercent: 100,
    ...overrides,
  };
}

describe("effectiveDepositPolicy", () => {
  it("returns the config when enabled, venueSlug and key are present", () => {
    const config = makeConfig({ enabled: true });
    const result = effectiveDepositPolicy({
      depositConfig: config,
      venueSlug: "the-oak-table",
      stripePublishableKey: "pk_test_abc",
      serverRequiresDeposit: false,
    });
    expect(result).toEqual(config);
  });

  it("returns null when config is disabled and the server does not require one", () => {
    const result = effectiveDepositPolicy({
      depositConfig: makeConfig({ enabled: false }),
      venueSlug: "the-oak-table",
      stripePublishableKey: "pk_test_abc",
      serverRequiresDeposit: false,
    });
    expect(result).toBeNull();
  });

  it("overrides a disabled config when the server requires one (risky-guest override)", () => {
    const config = makeConfig({ enabled: false });
    const result = effectiveDepositPolicy({
      depositConfig: config,
      venueSlug: "the-oak-table",
      stripePublishableKey: "pk_test_abc",
      serverRequiresDeposit: true,
    });
    expect(result).toEqual(config);
  });

  it("returns null when the publishable key is missing, even if enabled and server-required", () => {
    const result = effectiveDepositPolicy({
      depositConfig: makeConfig({ enabled: true }),
      venueSlug: "the-oak-table",
      stripePublishableKey: undefined,
      serverRequiresDeposit: true,
    });
    expect(result).toBeNull();
  });

  it("returns null when venueSlug is missing", () => {
    const result = effectiveDepositPolicy({
      depositConfig: makeConfig({ enabled: true }),
      venueSlug: undefined,
      stripePublishableKey: "pk_test_abc",
      serverRequiresDeposit: false,
    });
    expect(result).toBeNull();
  });

  it("returns null when there is no deposit config at all", () => {
    const result = effectiveDepositPolicy({
      depositConfig: null,
      venueSlug: "the-oak-table",
      stripePublishableKey: "pk_test_abc",
      serverRequiresDeposit: true,
    });
    expect(result).toBeNull();
  });

  it("passes through a per_person config unchanged", () => {
    const config = makeConfig({ depositType: "per_person", amountCents: 1000 });
    const result = effectiveDepositPolicy({
      depositConfig: config,
      venueSlug: "the-oak-table",
      stripePublishableKey: "pk_test_abc",
      serverRequiresDeposit: false,
    });
    expect(result?.depositType).toBe("per_person");
    expect(result?.amountCents).toBe(1000);
  });

  it("passes through a flat config unchanged", () => {
    const config = makeConfig({ depositType: "flat", amountCents: 2500 });
    const result = effectiveDepositPolicy({
      depositConfig: config,
      venueSlug: "the-oak-table",
      stripePublishableKey: "pk_test_abc",
      serverRequiresDeposit: false,
    });
    expect(result?.depositType).toBe("flat");
    expect(result?.amountCents).toBe(2500);
  });
});

describe("provisionalDepositRequired", () => {
  it("is true when the venue's general deposit policy is enabled and Stripe is configured", () => {
    expect(
      provisionalDepositRequired(makeConfig({ enabled: true }), "the-oak-table", "pk_test_abc")
    ).toBe(true);
  });

  it("is false when the venue's general deposit policy is disabled (risk not yet known)", () => {
    expect(
      provisionalDepositRequired(makeConfig({ enabled: false }), "the-oak-table", "pk_test_abc")
    ).toBe(false);
  });

  it("is false when there is no deposit config at all", () => {
    expect(provisionalDepositRequired(null, "the-oak-table", "pk_test_abc")).toBe(false);
  });

  it("is false when the venue's policy is enabled but the Stripe publishable key is missing", () => {
    expect(
      provisionalDepositRequired(makeConfig({ enabled: true }), "the-oak-table", undefined)
    ).toBe(false);
  });
});
