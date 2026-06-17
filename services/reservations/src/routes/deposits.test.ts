import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDepositDb, mockGuestDb } = vi.hoisted(() => ({
  mockDepositDb: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mockGuestDb: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({ prisma: { deposit: mockDepositDb, guest: mockGuestDb } });
});

const { mockPaymentIntents, mockCustomers } = vi.hoisted(() => ({
  mockPaymentIntents: {
    create: vi.fn(),
    capture: vi.fn(),
    cancel: vi.fn(),
  },
  mockCustomers: {
    create: vi.fn(),
  },
}));

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = mockPaymentIntents;
    customers = mockCustomers;
    webhooks = { constructEvent: vi.fn() };
    constructor(_key: string) {}
  }
  return { default: MockStripe };
});

// Mock auth so we don't need real JWT
vi.mock("@mbe/auth/fastify", () => ({
  requireAuth: vi.fn(async (request: { user?: unknown }) => {
    request.user = {
      sub: "auth0|user-123",
      iss: "https://test.auth0.com/",
      aud: "https://api.example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email: "test@example.com",
      email_verified: true,
      name: "Test User",
      picture: "https://example.com/pic.jpg",
      permissions: ["admin"],
    };
  }),
  optionalAuth: vi.fn(async () => {}),
  hasPermission: vi.fn(() => true),
}));

import { buildApp } from "../app.js";
import type { Deposit } from "../generated/prisma/index.js";

function makeDeposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: "dep-123",
    reservationId: "res-123",
    amountCents: 5000,
    currency: "usd",
    status: "pending",
    stripePaymentIntentId: null,
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

const ADMIN_TOKEN = "Bearer test-token";

describe("Deposit API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/deposits", () => {
    it("creates a deposit and returns 201 with pending status", async () => {
      const mockDeposit = makeDeposit();
      mockDepositDb.create.mockResolvedValueOnce(mockDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits",
        headers: { authorization: ADMIN_TOKEN },
        payload: {
          reservationId: "res-123",
          amountCents: 5000,
          currency: "usd",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.status).toBe("pending");
      await app.close();
    });

    it("returns 400 if reservationId is missing", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits",
        headers: { authorization: ADMIN_TOKEN },
        payload: {
          amountCents: 5000,
        },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it("returns 400 if amountCents is missing", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits",
        headers: { authorization: ADMIN_TOKEN },
        payload: {
          reservationId: "res-123",
        },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("GET /api/v1/deposits/:id", () => {
    it("returns a deposit by id", async () => {
      const mockDeposit = makeDeposit();
      mockDepositDb.findUnique.mockResolvedValueOnce(mockDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/deposits/dep-123",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.id).toBe("dep-123");
      await app.close();
    });

    it("returns 404 if deposit not found", async () => {
      mockDepositDb.findUnique.mockResolvedValueOnce(null);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/deposits/not-found",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("POST /api/v1/deposits/:id/capture", () => {
    it("captures (applies) a held deposit and returns 200", async () => {
      const heldDeposit = makeDeposit({
        status: "held",
        stripePaymentIntentId: "pi_test_123",
        heldAt: new Date(),
      });
      const appliedDeposit = makeDeposit({ status: "applied", appliedAt: new Date() });

      // getById (route check) + apply (service getById + service update)
      mockDepositDb.findUnique
        .mockResolvedValueOnce(heldDeposit) // route existence check
        .mockResolvedValueOnce(heldDeposit); // service._requireDeposit
      mockDepositDb.update.mockResolvedValueOnce(appliedDeposit);
      mockPaymentIntents.capture.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits/dep-123/capture",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.status).toBe("applied");
      await app.close();
    });

    it("returns 404 if deposit not found", async () => {
      mockDepositDb.findUnique.mockResolvedValueOnce(null);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits/not-found/capture",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it("returns 422 if deposit is not in held state", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      // route check + service._requireDeposit
      mockDepositDb.findUnique
        .mockResolvedValueOnce(pendingDeposit)
        .mockResolvedValueOnce(pendingDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits/dep-123/capture",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(422);
      await app.close();
    });
  });

  describe("POST /api/v1/deposits/:id/refund", () => {
    it("refunds a held deposit and returns 200", async () => {
      const heldDeposit = makeDeposit({
        status: "held",
        stripePaymentIntentId: "pi_test_123",
        heldAt: new Date(),
      });
      const refundedDeposit = makeDeposit({ status: "refunded", refundedAt: new Date() });

      mockDepositDb.findUnique
        .mockResolvedValueOnce(heldDeposit)
        .mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockResolvedValueOnce(refundedDeposit);
      mockPaymentIntents.cancel.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "canceled",
      });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits/dep-123/refund",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.status).toBe("refunded");
      await app.close();
    });

    it("returns 422 if deposit is not in held state", async () => {
      const appliedDeposit = makeDeposit({ status: "applied" });
      mockDepositDb.findUnique
        .mockResolvedValueOnce(appliedDeposit)
        .mockResolvedValueOnce(appliedDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits/dep-123/refund",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(422);
      await app.close();
    });
  });

  describe("POST /api/v1/deposits/:id/forfeit", () => {
    it("forfeits a held deposit and returns 200", async () => {
      const heldDeposit = makeDeposit({
        status: "held",
        stripePaymentIntentId: "pi_test_123",
        heldAt: new Date(),
      });
      const forfeitedDeposit = makeDeposit({ status: "forfeited", forfeitedAt: new Date() });

      mockDepositDb.findUnique
        .mockResolvedValueOnce(heldDeposit)
        .mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockResolvedValueOnce(forfeitedDeposit);
      mockPaymentIntents.capture.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits/dep-123/forfeit",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.status).toBe("forfeited");
      await app.close();
    });

    it("returns 422 if deposit is not in held state", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      mockDepositDb.findUnique
        .mockResolvedValueOnce(pendingDeposit)
        .mockResolvedValueOnce(pendingDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/deposits/dep-123/forfeit",
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(422);
      await app.close();
    });
  });
});
