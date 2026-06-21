import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockWebhooks, mockDepositFindFirst, mockDepositUpdate } = vi.hoisted(() => ({
  mockWebhooks: {
    constructEvent: vi.fn(),
  },
  mockDepositFindFirst: vi.fn(),
  mockDepositUpdate: vi.fn(),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      deposit: {
        findFirst: mockDepositFindFirst,
        findUnique: vi.fn(),
        create: vi.fn(),
        update: mockDepositUpdate,
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
    paymentIntents = { create: vi.fn(), capture: vi.fn(), cancel: vi.fn() };
    customers = { create: vi.fn() };
    webhooks = mockWebhooks;
    constructor(_key: string) {}
  }
  return { default: MockStripe };
});

import { buildApp } from "../app.js";

describe("POST /api/v1/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
