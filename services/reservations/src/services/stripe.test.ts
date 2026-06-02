import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so these refs are available inside the vi.mock factory
const { mockPaymentIntents, mockCustomers, mockWebhooks } = vi.hoisted(() => ({
  mockPaymentIntents: {
    create: vi.fn(),
    capture: vi.fn(),
    cancel: vi.fn(),
  },
  mockCustomers: {
    create: vi.fn(),
  },
  mockWebhooks: {
    constructEvent: vi.fn(),
  },
}));

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = mockPaymentIntents;
    customers = mockCustomers;
    webhooks = mockWebhooks;
    constructor(_key: string) {}
  }
  return { default: MockStripe };
});

import { StripeService } from "./stripe.js";

describe("StripeService", () => {
  let stripeService: StripeService;

  beforeEach(() => {
    vi.clearAllMocks();
    stripeService = new StripeService("sk_test_fake_key");
  });

  describe("createPaymentIntent", () => {
    it("creates a PaymentIntent with manual capture method", async () => {
      const mockIntent = {
        id: "pi_test_123",
        status: "requires_payment_method",
        amount: 5000,
        currency: "usd",
        capture_method: "manual",
        client_secret: "pi_test_123_secret",
      };
      mockPaymentIntents.create.mockResolvedValueOnce(mockIntent);

      const result = await stripeService.createPaymentIntent({
        amountCents: 5000,
        currency: "usd",
        customerId: "cus_test_123",
        reservationId: "res-123",
        metadata: { venueId: "venue-1" },
      });

      expect(mockPaymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          currency: "usd",
          capture_method: "manual",
          customer: "cus_test_123",
          metadata: expect.objectContaining({
            reservationId: "res-123",
            venueId: "venue-1",
          }),
        })
      );
      expect(result.id).toBe("pi_test_123");
      expect(result.clientSecret).toBe("pi_test_123_secret");
    });

    it("creates PaymentIntent without customer if not provided", async () => {
      const mockIntent = {
        id: "pi_test_456",
        status: "requires_payment_method",
        amount: 2000,
        currency: "usd",
        capture_method: "manual",
        client_secret: "pi_test_456_secret",
      };
      mockPaymentIntents.create.mockResolvedValueOnce(mockIntent);

      const result = await stripeService.createPaymentIntent({
        amountCents: 2000,
        currency: "usd",
        reservationId: "res-456",
      });

      const callArgs = mockPaymentIntents.create.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.customer).toBeUndefined();
      expect(result.id).toBe("pi_test_456");
    });
  });

  describe("capturePaymentIntent", () => {
    it("captures a payment intent", async () => {
      const mockCaptured = {
        id: "pi_test_123",
        status: "succeeded",
        amount_received: 5000,
      };
      mockPaymentIntents.capture.mockResolvedValueOnce(mockCaptured);

      const result = await stripeService.capturePaymentIntent("pi_test_123");

      expect(mockPaymentIntents.capture).toHaveBeenCalledWith("pi_test_123");
      expect(result.status).toBe("succeeded");
    });
  });

  describe("cancelPaymentIntent", () => {
    it("cancels a payment intent", async () => {
      const mockCancelled = {
        id: "pi_test_123",
        status: "canceled",
      };
      mockPaymentIntents.cancel.mockResolvedValueOnce(mockCancelled);

      const result = await stripeService.cancelPaymentIntent("pi_test_123");

      expect(mockPaymentIntents.cancel).toHaveBeenCalledWith("pi_test_123");
      expect(result.status).toBe("canceled");
    });
  });

  describe("createCustomer", () => {
    it("creates a Stripe customer with email and name", async () => {
      const mockCustomer = {
        id: "cus_new_123",
        email: "test@example.com",
        name: "Test User",
      };
      mockCustomers.create.mockResolvedValueOnce(mockCustomer);

      const result = await stripeService.createCustomer({
        email: "test@example.com",
        name: "Test User",
        metadata: { guestId: "guest-1" },
      });

      expect(mockCustomers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          name: "Test User",
          metadata: expect.objectContaining({ guestId: "guest-1" }),
        })
      );
      expect(result.id).toBe("cus_new_123");
    });
  });

  describe("constructWebhookEvent", () => {
    it("calls stripe.webhooks.constructEvent with payload and signature", () => {
      const mockEvent = {
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_test_123" } },
      };
      mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);

      const result = stripeService.constructWebhookEvent(
        Buffer.from("raw_payload"),
        "stripe_signature_header",
        "whsec_test_secret"
      );

      expect(mockWebhooks.constructEvent).toHaveBeenCalledWith(
        Buffer.from("raw_payload"),
        "stripe_signature_header",
        "whsec_test_secret"
      );
      expect(result.type).toBe("payment_intent.succeeded");
    });

    it("throws if signature is invalid", () => {
      mockWebhooks.constructEvent.mockImplementationOnce(() => {
        throw new Error("No signatures found matching the expected signature for payload");
      });

      expect(() =>
        stripeService.constructWebhookEvent(Buffer.from("raw"), "bad_sig", "whsec_test_secret")
      ).toThrow("No signatures found");
    });
  });
});
