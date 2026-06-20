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

vi.mock("./database.js", async () => {
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

import { DepositService, calculateDepositAmount } from "./deposit.js";
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

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockResolvedValueOnce(makeDeposit({ status: "applied" }));
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

      await depositService.apply("dep-123");

      expect(mockPaymentIntents.capture).toHaveBeenCalledWith("pi_test_123", undefined, {
        idempotencyKey: "dep-123:apply",
      });
    });

    it("updates DB to applied before calling Stripe (DB-first ordering)", async () => {
      const order: string[] = [];
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockImplementationOnce(async () => {
        order.push("db");
        return makeDeposit({ status: "applied" });
      });
      mockPaymentIntents.capture.mockImplementationOnce(async () => {
        order.push("stripe");
        return { id: "pi_test_123", status: "succeeded" };
      });

      await depositService.apply("dep-123");

      expect(order).toEqual(["db", "stripe"]);
    });

    it("rolls back DB to held when Stripe capture fails after the DB update", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update
        .mockResolvedValueOnce(makeDeposit({ status: "applied", appliedAt: new Date() }))
        .mockResolvedValueOnce(heldDeposit);
      mockPaymentIntents.capture.mockRejectedValueOnce(new Error("stripe boom"));

      await expect(depositService.apply("dep-123")).rejects.toThrow(/stripe boom/);

      expect(mockDepositDb.update).toHaveBeenCalledTimes(2);
      expect(mockDepositDb.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({ status: "held", appliedAt: null }),
        })
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

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockResolvedValueOnce(makeDeposit({ status: "refunded" }));
      mockPaymentIntents.cancel.mockResolvedValueOnce({ id: "pi_test_123", status: "canceled" });

      await depositService.refund("dep-123");

      expect(mockPaymentIntents.cancel).toHaveBeenCalledWith("pi_test_123", undefined, {
        idempotencyKey: "dep-123:refund",
      });
    });

    it("rolls back DB to held when Stripe cancel fails after the DB update", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update
        .mockResolvedValueOnce(makeDeposit({ status: "refunded", refundedAt: new Date() }))
        .mockResolvedValueOnce(heldDeposit);
      mockPaymentIntents.cancel.mockRejectedValueOnce(new Error("stripe boom"));

      await expect(depositService.refund("dep-123")).rejects.toThrow(/stripe boom/);

      expect(mockDepositDb.update).toHaveBeenCalledTimes(2);
      expect(mockDepositDb.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({ status: "held", refundedAt: null }),
        })
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

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update.mockResolvedValueOnce(makeDeposit({ status: "forfeited" }));
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

      await depositService.forfeit("dep-123");

      expect(mockPaymentIntents.capture).toHaveBeenCalledWith("pi_test_123", undefined, {
        idempotencyKey: "dep-123:forfeit",
      });
    });

    it("rolls back DB to held when Stripe capture fails after the DB update", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.update
        .mockResolvedValueOnce(makeDeposit({ status: "forfeited", forfeitedAt: new Date() }))
        .mockResolvedValueOnce(heldDeposit);
      mockPaymentIntents.capture.mockRejectedValueOnce(new Error("stripe boom"));

      await expect(depositService.forfeit("dep-123")).rejects.toThrow(/stripe boom/);

      expect(mockDepositDb.update).toHaveBeenCalledTimes(2);
      expect(mockDepositDb.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({ status: "held", forfeitedAt: null }),
        })
      );
    });
  });
});

describe("calculateDepositAmount", () => {
  it("multiplies depositAmountCents by partySize for per_person type", () => {
    const venue = { depositType: "per_person", depositAmountCents: 1000 };
    expect(calculateDepositAmount(venue, 4)).toBe(4000);
  });

  it("returns depositAmountCents unchanged for fixed type", () => {
    const venue = { depositType: "fixed", depositAmountCents: 5000 };
    expect(calculateDepositAmount(venue, 4)).toBe(5000);
  });

  it("returns zero when depositAmountCents is null", () => {
    const venue = { depositType: "fixed", depositAmountCents: null };
    expect(calculateDepositAmount(venue, 3)).toBe(0);
  });

  it("returns zero when depositAmountCents is null and type is per_person", () => {
    const venue = { depositType: "per_person", depositAmountCents: null };
    expect(calculateDepositAmount(venue, 3)).toBe(0);
  });

  it("returns zero for per_person with zero party size", () => {
    const venue = { depositType: "per_person", depositAmountCents: 1000 };
    expect(calculateDepositAmount(venue, 0)).toBe(0);
  });

  it("handles large party sizes correctly for per_person", () => {
    const venue = { depositType: "per_person", depositAmountCents: 500 };
    expect(calculateDepositAmount(venue, 100)).toBe(50000);
  });
});
