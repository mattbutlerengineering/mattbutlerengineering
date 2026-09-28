import { describe, it, expect } from "vitest";
import { GuestRiskResultSchema } from "@mbe/types/schemas";
import { buildGuestRiskFixture } from "../api-mocks.js";

// Pins the shared default GET /public/v1/venues/:slug/guest-risk mock
// (api-mocks.ts) to the GuestRiskResult contract. Without a default stub for
// this endpoint, every E2E confirm on a deposit-DISABLED venue that also has
// a Stripe key configured (guestRiskMatters() — effectiveDepositPolicy.ts)
// awaits this endpoint unmocked. e2e.yml tolerates that because a real
// reservations-api answers it; e2e-screenshots.yml has no backend at all, so
// the Vite proxy 502s and the ~7s retry blows Playwright's 5s default
// assertion timeout on the very next step (#4111).
describe("shared E2E mock — GuestRiskResult contract", () => {
  it("parses against GuestRiskResultSchema", () => {
    const fixture = buildGuestRiskFixture();

    expect(() => GuestRiskResultSchema.parse(fixture)).not.toThrow();
  });

  it("defaults to a non-risky guest so it never accidentally forces a deposit", () => {
    const fixture = buildGuestRiskFixture();

    expect(fixture).toEqual({ riskScore: "standard", requiresDeposit: false });
  });
});
