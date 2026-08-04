import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockWebhooks,
  mockDepositFindFirst,
  mockDepositFindUnique,
  mockDepositUpdate,
  mockDepositUpdateMany,
  mockStripeCancel,
} = vi.hoisted(() => ({
  mockWebhooks: {
    constructEvent: vi.fn(),
  },
  mockDepositFindFirst: vi.fn(),
  mockDepositFindUnique: vi.fn(),
  mockDepositUpdate: vi.fn(),
  mockDepositUpdateMany: vi.fn(),
  mockStripeCancel: vi.fn(),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      deposit: {
        findFirst: mockDepositFindFirst,
        findUnique: mockDepositFindUnique,
        create: vi.fn(),
        update: mockDepositUpdate,
        updateMany: mockDepositUpdateMany,
      },
      guest: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
  });
});

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = {
      create: vi.fn(),
      capture: vi.fn(),
      cancel: mockStripeCancel,
    };
    customers = { create: vi.fn() };
    webhooks = mockWebhooks;
    constructor(_key: string) {}
  }
  return { default: MockStripe };
});

import { buildApp } from "../app.js";

describe("POST /api/v1/stripe/webhook", () => {
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    // A configured signing secret is the normal production state. Without it the
    // route fails closed (see dedicated test below), so set it for the tests
    // that exercise the verification + dispatch path.
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  afterEach(() => {
    if (originalWebhookSecret === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
    }
  });

  it("returns 503 and never verifies when STRIPE_WEBHOOK_SECRET is unset (fail closed)", async () => {
    // An empty secret makes Stripe's HMAC use an empty (publicly known) key,
    // which would accept forged events. The route must reject before verifying.
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify({ type: "payment_intent.succeeded" })),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "anything",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(mockWebhooks.constructEvent).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 400 if stripe-signature header is missing", async () => {
    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from("{}"),
      headers: {
        "content-type": "application/json",
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 if webhook signature is invalid", async () => {
    mockWebhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from("{}"),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "bad_signature",
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 200 for an unknown event type (no-op, Stripe should not retry)", async () => {
    const mockEvent = {
      type: "customer.created",
      data: { object: { id: "cus_123" } },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify(mockEvent)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_test_sig",
      },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns 500 when a registered handler throws (Stripe should retry)", async () => {
    const mockEvent = {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_123",
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    // Make depositService.getByPaymentIntentId throw to simulate a transient DB error
    mockDepositFindFirst.mockRejectedValueOnce(new Error("DB connection timeout"));

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify(mockEvent)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_test_sig",
      },
    });

    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it("returns 200 for a retried payment_intent.succeeded when deposit is already held (idempotent no-op)", async () => {
    const mockEvent = {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_already_held",
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    // Deposit is already in 'held' state — handler should be a no-op (no throw)
    mockDepositFindFirst.mockResolvedValueOnce({
      id: "dep_123",
      reservationId: "res_123",
      amountCents: 5000,
      currency: "usd",
      status: "held",
      stripePaymentIntentId: "pi_already_held",
      stripeCustomerId: null,
      heldAt: new Date(),
      appliedAt: null,
      refundedAt: null,
      forfeitedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify(mockEvent)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_test_sig",
      },
    });

    // Already held: the handler skips the transition (status !== 'pending'), no throw → 200
    expect(response.statusCode).toBe(200);
    // depositService.hold() should NOT have been called (no DB update)
    expect(mockDepositUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 200 for charge.refunded with payment_intent as string id and calls depositService.refund", async () => {
    const mockEvent = {
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_123",
          payment_intent: "pi_held_deposit", // string id
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    const depositMock = {
      id: "dep_456",
      reservationId: "res_456",
      amountCents: 10000,
      currency: "usd",
      status: "held",
      stripePaymentIntentId: "pi_held_deposit",
      stripeCustomerId: null,
      heldAt: new Date(),
      appliedAt: null,
      refundedAt: null,
      forfeitedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // onChargeRefunded calls getByPaymentIntentId -> findFirst
    mockDepositFindFirst.mockResolvedValueOnce(depositMock);
    // refund() calls _requireDeposit -> findUnique
    mockDepositFindUnique.mockResolvedValueOnce(depositMock);
    // refund() calls updateMany with CAS condition
    mockDepositUpdateMany.mockResolvedValueOnce({ count: 1 });
    // refund() fetches the updated row via _requireDeposit -> findUnique
    mockDepositFindUnique.mockResolvedValueOnce({
      ...depositMock,
      status: "refunded",
      refundedAt: new Date(),
    });
    // refund() calls stripe.cancelPaymentIntent
    mockStripeCancel.mockResolvedValueOnce({ id: "pi_held_deposit", status: "canceled" });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify(mockEvent)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_test_sig",
      },
    });

    expect(response.statusCode).toBe(200);
    // Should have looked up the deposit by payment intent id
    expect(mockDepositFindFirst).toHaveBeenCalled();
    // Should have transitioned via updateMany
    expect(mockDepositUpdateMany).toHaveBeenCalled();
    // Should have called Stripe to cancel
    expect(mockStripeCancel).toHaveBeenCalled();
    await app.close();
  });

  it("returns 200 for charge.refunded with payment_intent as expanded object and calls depositService.refund", async () => {
    const mockEvent = {
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_456",
          payment_intent: { id: "pi_expanded_deposit" }, // expanded object
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    const depositMock = {
      id: "dep_789",
      reservationId: "res_789",
      amountCents: 15000,
      currency: "usd",
      status: "held",
      stripePaymentIntentId: "pi_expanded_deposit",
      stripeCustomerId: null,
      heldAt: new Date(),
      appliedAt: null,
      refundedAt: null,
      forfeitedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDepositFindFirst.mockResolvedValueOnce(depositMock);
    mockDepositFindUnique.mockResolvedValueOnce(depositMock);
    mockDepositUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockDepositFindUnique.mockResolvedValueOnce({
      ...depositMock,
      status: "refunded",
      refundedAt: new Date(),
    });
    mockStripeCancel.mockResolvedValueOnce({ id: "pi_expanded_deposit", status: "canceled" });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify(mockEvent)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_test_sig",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockDepositFindFirst).toHaveBeenCalled();
    expect(mockDepositUpdateMany).toHaveBeenCalled();
    expect(mockStripeCancel).toHaveBeenCalled();
    await app.close();
  });

  it("returns 200 for charge.refunded when no deposit exists (idempotent no-op)", async () => {
    const mockEvent = {
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_no_deposit",
          payment_intent: "pi_orphaned",
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    // No deposit found for this payment intent
    mockDepositFindFirst.mockResolvedValueOnce(null);

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify(mockEvent)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_test_sig",
      },
    });

    expect(response.statusCode).toBe(200);
    // Should not have attempted to refund
    expect(mockDepositUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("calls depositService.refund for payment_intent.canceled when deposit is held", async () => {
    const mockEvent = {
      type: "payment_intent.canceled",
      data: {
        object: {
          id: "pi_canceled_held",
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    const depositMock = {
      id: "dep_held_cancel",
      reservationId: "res_held_cancel",
      amountCents: 8000,
      currency: "usd",
      status: "held",
      stripePaymentIntentId: "pi_canceled_held",
      stripeCustomerId: null,
      heldAt: new Date(),
      appliedAt: null,
      refundedAt: null,
      forfeitedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDepositFindFirst.mockResolvedValueOnce(depositMock);
    mockDepositFindUnique.mockResolvedValueOnce(depositMock);
    mockDepositUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockDepositFindUnique.mockResolvedValueOnce({
      ...depositMock,
      status: "refunded",
      refundedAt: new Date(),
    });
    mockStripeCancel.mockResolvedValueOnce({ id: "pi_canceled_held", status: "canceled" });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify(mockEvent)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_test_sig",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockDepositUpdateMany).toHaveBeenCalled();
    expect(mockStripeCancel).toHaveBeenCalled();
    await app.close();
  });

  it("does NOT call depositService.refund for payment_intent.canceled when deposit is pending", async () => {
    const mockEvent = {
      type: "payment_intent.canceled",
      data: {
        object: {
          id: "pi_canceled_pending",
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    mockDepositFindFirst.mockResolvedValueOnce({
      id: "dep_pending_cancel",
      reservationId: "res_pending_cancel",
      amountCents: 12000,
      currency: "usd",
      status: "pending", // not held
      stripePaymentIntentId: "pi_canceled_pending",
      stripeCustomerId: null,
      heldAt: null,
      appliedAt: null,
      refundedAt: null,
      forfeitedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/stripe/webhook",
      payload: Buffer.from(JSON.stringify(mockEvent)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_test_sig",
      },
    });

    expect(response.statusCode).toBe(200);
    // Should not have called refund (status is pending, not held)
    expect(mockDepositUpdate).not.toHaveBeenCalled();
    await app.close();
  });
});
