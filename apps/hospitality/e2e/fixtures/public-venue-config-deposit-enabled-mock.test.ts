import { describe, it, expect } from "vitest";
import { PublicVenueConfigSchema } from "@mbe/types/schemas";
import { evaluateCancellationFee } from "@mbe/cancellation-policy";
import { buildDepositEnabledPublicVenueConfigFixture } from "../api-mocks.js";

// Pins the deposit-enabled counterpart of the public/v1/venues/:slug E2E mock
// (#4061) to the PublicVenueConfig contract, and — because the E2E specs that
// consume this fixture can't run here (they need a real Auth0 session, see
// cancellation-fee-banner.spec.ts) — also pins the exact fee numbers those
// specs assert against. If either the fixture's deposit fields or the shared
// evaluateCancellationFee logic drift out of sync, this (required, fast)
// vitest job catches it instead of only the (advisory, slow) Hospitality E2E
// job.
describe("public/v1/venues/:slug E2E mock — deposit-enabled PublicVenueConfig contract", () => {
  it("parses against PublicVenueConfigSchema", () => {
    const fixture = buildDepositEnabledPublicVenueConfigFixture();

    expect(() => PublicVenueConfigSchema.parse(fixture)).not.toThrow();
  });

  it("returns exactly the fields PublicVenueConfigSchema declares", () => {
    const fixture = buildDepositEnabledPublicVenueConfigFixture();

    expect(Object.keys(fixture).sort()).toEqual(Object.keys(PublicVenueConfigSchema.shape).sort());
  });

  it("includes an enabled deposit object matching PublicVenueDepositSchema", () => {
    const fixture = buildDepositEnabledPublicVenueConfigFixture();

    expect(fixture.deposit).toEqual({
      enabled: true,
      depositType: "flat",
      amountCents: 5000,
      freeCancellationHours: 24,
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    });
  });

  it("omits internal-only fields (id, venueGroup, venueGroupId, timestamps)", () => {
    const fixture = buildDepositEnabledPublicVenueConfigFixture();

    expect(fixture).not.toHaveProperty("id");
    expect(fixture).not.toHaveProperty("venueGroup");
    expect(fixture).not.toHaveProperty("venueGroupId");
    expect(fixture).not.toHaveProperty("createdAt");
    expect(fixture).not.toHaveProperty("updatedAt");
  });

  // cancellation-fee-banner.spec.ts freezes "now" 6 hours before the
  // reservation's start time — well inside this fixture's 24h free-
  // cancellation window, so the quote is always the "late" bucket. Pinning
  // the resulting fee here means a change to either the fixture's deposit
  // numbers or evaluateCancellationFee's math fails this fast, required job
  // instead of only the advisory E2E spec.
  it("produces the late-cancellation fee the E2E fee-banner spec asserts", () => {
    const fixture = buildDepositEnabledPublicVenueConfigFixture();
    const reservationTime = new Date("2026-05-17T18:00:00.000Z");
    const now = new Date("2026-05-17T12:00:00.000Z");

    const fee = evaluateCancellationFee(
      {
        depositAmountCents: fixture.deposit.amountCents as number,
        freeCancellationHours: fixture.deposit.freeCancellationHours,
        lateCancellationFeePercent: fixture.deposit.lateCancellationFeePercent,
        noShowFeePercent: fixture.deposit.noShowFeePercent,
      },
      reservationTime,
      now
    );

    expect(fee).toEqual({
      feeType: "late",
      feeAmountCents: 2500,
      refundAmountCents: 2500,
      depositAction: "refund_partial",
    });
  });
});
