import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import { verifyStripeWebhookSignature } from "./stripe.js";

/**
 * Real HMAC signatures, generated with Stripe's own test helper — no
 * `vi.mock("stripe")`. (services/stripe.test.ts mocks the SDK module for the
 * network calls, which is why these live in their own file.)
 */
const SECRET = "whsec_test_signature_secret";
const event = {
  id: "evt_test_1",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_test_123" } },
};
const payload = JSON.stringify(event);
const sign = (body: string, secret = SECRET) =>
  Stripe.webhooks.generateTestHeaderString({ payload: body, secret });

describe("verifyStripeWebhookSignature", () => {
  it("returns the parsed event for a validly signed raw body", () => {
    const result = verifyStripeWebhookSignature(Buffer.from(payload), sign(payload), SECRET);
    expect(result).toMatchObject({ id: "evt_test_1", type: "payment_intent.succeeded" });
  });

  it("throws when the body was tampered with after signing", () => {
    const tampered = payload.replace("pi_test_123", "pi_attacker");
    expect(() =>
      verifyStripeWebhookSignature(Buffer.from(tampered), sign(payload), SECRET)
    ).toThrow();
  });

  it("throws when the payload was signed with a different secret", () => {
    expect(() =>
      verifyStripeWebhookSignature(Buffer.from(payload), sign(payload, "whsec_other"), SECRET)
    ).toThrow();
  });

  it("throws when the signature header is missing", () => {
    expect(() => verifyStripeWebhookSignature(Buffer.from(payload), "", SECRET)).toThrow();
  });
});
