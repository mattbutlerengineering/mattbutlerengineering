import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDepositDb, mockGuestDb } = vi.hoisted(() => ({
  mockDepositDb: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mockGuestDb: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("./database.js", () => ({
  prisma: {
    deposit: mockDepositDb,
    guest: mockGuestDb,
  },
  getSlowQueryStats: vi.fn().mockReturnValue([]),
  getPoolStats: vi.fn().mockReturnValue({}),
  getPoolMetrics: vi.fn().mockReturnValue({}),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
}));

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

import { DepositService } from "./deposit.js";
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

describe("DepositService", () => {
  let depositService: DepositService;

  beforeEach(() => {
    vi.clearAllMocks();
    depositService = new DepositService("sk_test_fake_key");
  });

  describe("create", () => {
    it("creates a deposit record in pending state", async () => {
      const mockDeposit = makeDeposit();
      mockDepositDb.create.mockResolvedValueOnce(mockDeposit);

      const result = await depositService.create({
        reservationId: "res-123",
        amountCents: 5000,
        currency: "usd",
      });

      expect(mockDepositDb.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reservationId: "res-123",
            amountCents: 5000,
            currency: "usd",
            status: "pending",
          }),
        })
      );
      expect(result.status).toBe("pending");
    });
  });

  describe("getById", () => {
    it("returns deposit by id", async () => {
      const mockDeposit = makeDeposit();
      mockDepositDb.findUnique.mockResolvedValueOnce(mockDeposit);

      const result = await depositService.getById("dep-123");

      expect(mockDepositDb.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "dep-123" } })
      );
      expect(result).toEqual(mockDeposit);
    });

    it("returns null when deposit not found", async () => {
      mockDepositDb.findUnique.mockResolvedValueOnce(null);

      const result = await depositService.getById("dep-not-found");
      expect(result).toBeNull();
    });
  });

  describe("getByReservationId", () => {
    it("returns deposit by reservation id", async () => {
      const mockDeposit = makeDeposit();
      mockDepositDb.findUnique.mockResolvedValueOnce(mockDeposit);

      const result = await depositService.getByReservationId("res-123");
      expect(result).toEqual(mockDeposit);
    });
  });

  describe("hold (pending -> held)", () => {
    it("updates deposit to held and stores paymentIntentId", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      const heldDeposit = makeDeposit({
        status: "held",
        stripePaymentIntentId: "pi_test_123",
        heldAt: new Date(),
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(pendingDeposit);
      mockDepositDb.update.mockResolvedValueOnce(heldDeposit);

      const result = await depositService.hold("dep-123", "pi_test_123");

      expect(mockDepositDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({
            status: "held",
            stripePaymentIntentId: "pi_test_123",
            heldAt: expect.any(Date),
          }),
        })
      );
      expect(result.status).toBe("held");
    });

    it("throws if deposit is not in pending state", async () => {
      const heldDeposit = makeDeposit({ status: "held" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);

      await expect(depositService.hold("dep-123", "pi_test_123")).rejects.toThrow(
        /invalid.*transition|cannot transition/i
      );
    });

    it("throws if deposit not found", async () => {
      mockDepositDb.findUnique.mockResolvedValueOnce(null);

      await expect(depositService.hold("dep-not-found", "pi_test_123")).rejects.toThrow(
        /not found/i
      );
    });
  });

  describe("apply (held -> applied)", () => {
    it("transitions held deposit to applied", async () => {
      const heldDeposit = makeDeposit({
        status: "held",
        stripePaymentIntentId: "pi_test_123",
      });
      const appliedDeposit = makeDeposit({
        status: "applied",
        stripePaymentIntentId: "pi_test_123",
        appliedAt: new Date(),
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockResolvedValueOnce(appliedDeposit);
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

      const result = await depositService.apply("dep-123");

      expect(mockDepositDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({
            status: "applied",
            appliedAt: expect.any(Date),
          }),
        })
      );
      expect(result.status).toBe("applied");
    });

    it("throws if deposit not in held state", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      mockDepositDb.findUnique.mockResolvedValueOnce(pendingDeposit);

      await expect(depositService.apply("dep-123")).rejects.toThrow(
        /invalid.*transition|cannot transition/i
      );
    });
  });

  describe("refund (held -> refunded)", () => {
    it("transitions held deposit to refunded", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      const refundedDeposit = makeDeposit({ status: "refunded", refundedAt: new Date() });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockResolvedValueOnce(refundedDeposit);
      mockPaymentIntents.cancel.mockResolvedValueOnce({ id: "pi_test_123", status: "canceled" });

      const result = await depositService.refund("dep-123");

      expect(mockDepositDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({
            status: "refunded",
            refundedAt: expect.any(Date),
          }),
        })
      );
      expect(result.status).toBe("refunded");
    });

    it("throws if deposit not in held state", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      mockDepositDb.findUnique.mockResolvedValueOnce(pendingDeposit);

      await expect(depositService.refund("dep-123")).rejects.toThrow(
        /invalid.*transition|cannot transition/i
      );
    });
  });

  describe("forfeit (held -> forfeited)", () => {
    it("transitions held deposit to forfeited", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      const forfeitedDeposit = makeDeposit({ status: "forfeited", forfeitedAt: new Date() });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockResolvedValueOnce(forfeitedDeposit);
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

      const result = await depositService.forfeit("dep-123");

      expect(mockDepositDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({
            status: "forfeited",
            forfeitedAt: expect.any(Date),
          }),
        })
      );
      expect(result.status).toBe("forfeited");
    });

    it("throws if deposit not in held state", async () => {
      const appliedDeposit = makeDeposit({ status: "applied" });
      mockDepositDb.findUnique.mockResolvedValueOnce(appliedDeposit);

      await expect(depositService.forfeit("dep-123")).rejects.toThrow(
        /invalid.*transition|cannot transition/i
      );
    });
  });
});
