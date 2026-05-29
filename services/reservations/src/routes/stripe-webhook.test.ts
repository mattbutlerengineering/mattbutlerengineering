import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDepositDb } = vi.hoisted(() => ({
  mockDepositDb: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    deposit: mockDepositDb,
    guest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  getSlowQueryStats: vi.fn().mockReturnValue([]),
  getPoolStats: vi.fn().mockReturnValue({}),
  getPoolMetrics: vi.fn().mockReturnValue({}),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
}));

const { mockWebhooks } = vi.hoisted(() => ({
  mockWebhooks: {
    constructEvent: vi.fn(),
  },
}));

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
import type { Deposit } from "../generated/prisma/index.js";

function makeDeposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: "dep-123",
    reservationId: "res-123",
    amountCents: 5000,
    currency: "usd",
    status: "pending",
    stripePaymentIntentId: "pi_test_123",
    stripeCustomerId: null,
    heldAt: null,
    appliedAt: null,
    refundedAt: null,
    forfeitedAt: null,
    createdAt: new Date("2026-01-25T00:00:00.000Z"),
    updatedAt: new Date("2026-01-25T00:00:00.000Z"),
    ...overrides,
  };
}

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

  it("handles payment_intent.succeeded — transitions deposit pending -> held", async () => {
    const pendingDeposit = makeDeposit({ status: "pending" });
    const heldDeposit = makeDeposit({ status: "held", heldAt: new Date() });

    const mockEvent = {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_123",
          status: "requires_capture",
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    // getByPaymentIntentId (findFirst)
    mockDepositDb.findFirst.mockResolvedValueOnce(pendingDeposit);
    // depositService.hold -> _requireDeposit (findUnique)
    mockDepositDb.findUnique.mockResolvedValueOnce(pendingDeposit);
    mockDepositDb.update.mockResolvedValueOnce(heldDeposit);

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
    expect(mockDepositDb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "held",
          heldAt: expect.any(Date),
        }),
      })
    );
    await app.close();
  });

  it("handles payment_intent.canceled — transitions deposit held -> refunded", async () => {
    const heldDeposit = makeDeposit({ status: "held", heldAt: new Date() });
    const refundedDeposit = makeDeposit({ status: "refunded", refundedAt: new Date() });

    const mockEvent = {
      type: "payment_intent.canceled",
      data: {
        object: {
          id: "pi_test_123",
          status: "canceled",
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    // getByPaymentIntentId
    mockDepositDb.findFirst.mockResolvedValueOnce(heldDeposit);
    // depositService.refund -> _requireDeposit
    mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
    mockDepositDb.update.mockResolvedValueOnce(refundedDeposit);

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

  it("handles charge.refunded — transitions deposit held -> refunded", async () => {
    const heldDeposit = makeDeposit({ status: "held", heldAt: new Date() });
    const refundedDeposit = makeDeposit({ status: "refunded", refundedAt: new Date() });

    const mockEvent = {
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_test_123",
          payment_intent: "pi_test_123",
          refunded: true,
        },
      },
    };
    mockWebhooks.constructEvent.mockReturnValueOnce(mockEvent);
    // getByPaymentIntentId
    mockDepositDb.findFirst.mockResolvedValueOnce(heldDeposit);
    // depositService.refund -> _requireDeposit
    mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
    mockDepositDb.update.mockResolvedValueOnce(refundedDeposit);

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

  it("returns 200 for unknown event types (graceful ignore)", async () => {
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
});
