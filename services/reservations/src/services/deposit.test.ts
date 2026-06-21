import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDepositDb, mockGuestDb } = vi.hoisted(() => ({
  mockDepositDb: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
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

const { mockPaymentIntents, mockCustomers, mockRefunds } = vi.hoisted(() => ({
  mockPaymentIntents: {
    create: vi.fn(),
    capture: vi.fn(),
    cancel: vi.fn(),
    retrieve: vi.fn(),
  },
  mockCustomers: {
    create: vi.fn(),
  },
  mockRefunds: {
    create: vi.fn(),
  },
}));

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = mockPaymentIntents;
    customers = mockCustomers;
    refunds = mockRefunds;
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
    feeAmountCents: null,
    refundAmountCents: null,
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
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(appliedDeposit);
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

      const result = await depositService.apply("dep-123");

      expect(mockDepositDb.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123", status: "held" },
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

    it("throws a conflict error if the CAS races (updateMany returns count 0) without calling Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race

      await expect(depositService.apply("dep-123")).rejects.toThrow(
        /conflict|lost.*race|concurrent/i
      );
      expect(mockPaymentIntents.capture).not.toHaveBeenCalled();
    });

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "applied" }));
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
      mockDepositDb.updateMany.mockImplementationOnce(async () => {
        order.push("db");
        return { count: 1 };
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "applied" }));
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
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(
        makeDeposit({ status: "applied", appliedAt: new Date() })
      );
      mockDepositDb.update.mockResolvedValueOnce(heldDeposit);
      mockPaymentIntents.capture.mockRejectedValueOnce(new Error("stripe boom"));

      await expect(depositService.apply("dep-123")).rejects.toThrow(/stripe boom/);

      expect(mockDepositDb.update).toHaveBeenCalledTimes(1);
      expect(mockDepositDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({ status: "held", appliedAt: null }),
        })
      );
    });

    it("surfaces the original Stripe error when the rollback DB write also fails", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(
        makeDeposit({ status: "applied", appliedAt: new Date() })
      );
      mockDepositDb.update.mockRejectedValueOnce(new Error("db down")); // rollback write fails
      mockPaymentIntents.capture.mockRejectedValueOnce(new Error("stripe boom"));

      // The caller must see the original Stripe failure, not the rollback DB error.
      await expect(depositService.apply("dep-123")).rejects.toThrow(/stripe boom/);
    });
  });

  describe("refund (held -> refunded)", () => {
    it("transitions held deposit to refunded", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      const refundedDeposit = makeDeposit({ status: "refunded", refundedAt: new Date() });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(refundedDeposit);
      mockPaymentIntents.cancel.mockResolvedValueOnce({ id: "pi_test_123", status: "canceled" });

      const result = await depositService.refund("dep-123");

      expect(mockDepositDb.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123", status: "held" },
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

    it("throws a conflict error if the CAS races (updateMany returns count 0) without calling Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race

      await expect(depositService.refund("dep-123")).rejects.toThrow(
        /conflict|lost.*race|concurrent/i
      );
      expect(mockPaymentIntents.cancel).not.toHaveBeenCalled();
    });

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "refunded" }));
      mockPaymentIntents.cancel.mockResolvedValueOnce({ id: "pi_test_123", status: "canceled" });

      await depositService.refund("dep-123");

      expect(mockPaymentIntents.cancel).toHaveBeenCalledWith("pi_test_123", undefined, {
        idempotencyKey: "dep-123:refund",
      });
    });

    it("rolls back DB to held when Stripe cancel fails after the DB update", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(
        makeDeposit({ status: "refunded", refundedAt: new Date() })
      );
      mockDepositDb.update.mockResolvedValueOnce(heldDeposit);
      mockPaymentIntents.cancel.mockRejectedValueOnce(new Error("stripe boom"));

      await expect(depositService.refund("dep-123")).rejects.toThrow(/stripe boom/);

      expect(mockDepositDb.update).toHaveBeenCalledTimes(1);
      expect(mockDepositDb.update).toHaveBeenCalledWith(
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
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(forfeitedDeposit);
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

      const result = await depositService.forfeit("dep-123");

      expect(mockDepositDb.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123", status: "held" },
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

    it("throws a conflict error if the CAS races (updateMany returns count 0) without calling Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race

      await expect(depositService.forfeit("dep-123")).rejects.toThrow(
        /conflict|lost.*race|concurrent/i
      );
      expect(mockPaymentIntents.capture).not.toHaveBeenCalled();
    });

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "forfeited" }));
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

      await depositService.forfeit("dep-123");

      expect(mockPaymentIntents.capture).toHaveBeenCalledWith("pi_test_123", undefined, {
        idempotencyKey: "dep-123:forfeit",
      });
    });

    it("rolls back DB to held when Stripe capture fails after the DB update", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(
        makeDeposit({ status: "forfeited", forfeitedAt: new Date() })
      );
      mockDepositDb.update.mockResolvedValueOnce(heldDeposit);
      mockPaymentIntents.capture.mockRejectedValueOnce(new Error("stripe boom"));

      await expect(depositService.forfeit("dep-123")).rejects.toThrow(/stripe boom/);

      expect(mockDepositDb.update).toHaveBeenCalledTimes(1);
      expect(mockDepositDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({ status: "held", forfeitedAt: null }),
        })
      );
    });
  });

  describe("refundPartial (held -> partial_refunded)", () => {
    it("transitions held deposit to partial_refunded and partially refunds", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      const partialDeposit = makeDeposit({
        status: "partial_refunded",
        refundedAt: new Date(),
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(partialDeposit);
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });
      mockPaymentIntents.retrieve.mockResolvedValueOnce({ latest_charge: "ch_1" });
      mockRefunds.create.mockResolvedValueOnce({ id: "re_1", status: "succeeded", amount: 3000 });

      const result = await depositService.refundPartial("dep-123", 3000);

      expect(mockDepositDb.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123", status: "held" },
          data: expect.objectContaining({
            status: "partial_refunded",
            refundedAt: expect.any(Date),
          }),
        })
      );
      expect(result.status).toBe("partial_refunded");
    });

    it("throws if deposit not in held state", async () => {
      const appliedDeposit = makeDeposit({ status: "applied" });
      mockDepositDb.findUnique.mockResolvedValueOnce(appliedDeposit);

      await expect(depositService.refundPartial("dep-123", 3000)).rejects.toThrow(
        /invalid.*transition|cannot transition/i
      );
    });

    it("throws if deposit not found", async () => {
      mockDepositDb.findUnique.mockResolvedValueOnce(null);

      await expect(depositService.refundPartial("dep-nope", 3000)).rejects.toThrow(/not found/i);
    });

    it("throws a conflict error if the CAS races (updateMany returns count 0) without calling Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race

      await expect(depositService.refundPartial("dep-123", 3000)).rejects.toThrow(
        /conflict|lost.*race|concurrent/i
      );
      expect(mockPaymentIntents.capture).not.toHaveBeenCalled();
    });

    it("updates DB to partial_refunded before calling Stripe (DB-first ordering)", async () => {
      const order: string[] = [];
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockImplementationOnce(async () => {
        order.push("db");
        return { count: 1 };
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "partial_refunded" }));
      mockPaymentIntents.capture.mockImplementationOnce(async () => {
        order.push("capture");
        return { id: "pi_test_123", status: "succeeded" };
      });
      mockPaymentIntents.retrieve.mockResolvedValueOnce({ latest_charge: "ch_1" });
      mockRefunds.create.mockImplementationOnce(async () => {
        order.push("refund");
        return { id: "re_1", status: "succeeded", amount: 3000 };
      });

      await depositService.refundPartial("dep-123", 3000);

      expect(order).toEqual(["db", "capture", "refund"]);
    });

    it("passes a stable idempotency key on the capture", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "partial_refunded" }));
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });
      mockPaymentIntents.retrieve.mockResolvedValueOnce({ latest_charge: "ch_1" });
      mockRefunds.create.mockResolvedValueOnce({ id: "re_1", status: "succeeded", amount: 3000 });

      await depositService.refundPartial("dep-123", 3000);

      expect(mockPaymentIntents.capture).toHaveBeenCalledWith("pi_test_123", undefined, {
        idempotencyKey: "dep-123:refundPartial",
      });
    });

    it("passes a stable idempotency key on the refund", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "partial_refunded" }));
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });
      mockPaymentIntents.retrieve.mockResolvedValueOnce({ latest_charge: "ch_1" });
      mockRefunds.create.mockResolvedValueOnce({ id: "re_1", status: "succeeded", amount: 3000 });

      await depositService.refundPartial("dep-123", 3000);

      expect(mockRefunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ charge: "ch_1", amount: 3000 }),
        { idempotencyKey: "dep-123:refundPartial:refund" }
      );
    });

    it("rolls back DB to held when the CAPTURE fails (no money moved)", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(
        makeDeposit({ status: "partial_refunded", refundedAt: new Date() })
      );
      mockDepositDb.update.mockResolvedValueOnce(heldDeposit);
      mockPaymentIntents.capture.mockRejectedValueOnce(new Error("stripe capture boom"));

      await expect(depositService.refundPartial("dep-123", 3000)).rejects.toThrow(
        /stripe capture boom/
      );

      // CAS write via updateMany + rollback via update.
      expect(mockDepositDb.updateMany).toHaveBeenCalledTimes(1);
      expect(mockDepositDb.update).toHaveBeenCalledTimes(1);
      expect(mockDepositDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123" },
          data: expect.objectContaining({ status: "held", refundedAt: null }),
        })
      );
      // The refund must never be attempted when the capture failed.
      expect(mockRefunds.create).not.toHaveBeenCalled();
    });

    it("does NOT roll back to held when capture succeeds but the refund throws (card is captured)", async () => {
      // Money-safety: once captured, rolling back to `held` would lie about the
      // charge and re-capture on retry. The row must stay partial_refunded and
      // the error surface so the refund can be retried idempotently.
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(
        makeDeposit({ status: "partial_refunded", refundedAt: new Date() })
      );
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });
      mockPaymentIntents.retrieve.mockResolvedValueOnce({ latest_charge: "ch_1" });
      mockRefunds.create.mockRejectedValueOnce(new Error("stripe refund boom"));

      await expect(depositService.refundPartial("dep-123", 3000)).rejects.toThrow(
        /stripe refund boom/
      );

      // Only the CAS write happened — no rollback to held.
      expect(mockDepositDb.updateMany).toHaveBeenCalledTimes(1);
      expect(mockDepositDb.update).not.toHaveBeenCalled();
    });

    it("is re-entrant: a retry already in partial_refunded replays Stripe without re-transitioning", async () => {
      const partialDeposit = makeDeposit({
        status: "partial_refunded",
        stripePaymentIntentId: "pi_test_123",
        refundedAt: new Date(),
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(partialDeposit);
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });
      mockPaymentIntents.retrieve.mockResolvedValueOnce({ latest_charge: "ch_1" });
      mockRefunds.create.mockResolvedValueOnce({ id: "re_1", status: "succeeded", amount: 3000 });

      const result = await depositService.refundPartial("dep-123", 3000);

      // No DB write on the retry — the row is already partial_refunded.
      expect(mockDepositDb.updateMany).not.toHaveBeenCalled();
      expect(mockDepositDb.update).not.toHaveBeenCalled();
      // Stripe steps replay with their idempotency keys.
      expect(mockPaymentIntents.capture).toHaveBeenCalledWith("pi_test_123", undefined, {
        idempotencyKey: "dep-123:refundPartial",
      });
      expect(result.status).toBe("partial_refunded");
    });

    it("does NOT roll back to held when a re-entrant retry's capture fails (card already captured)", async () => {
      // The first attempt already captured the card and moved the row to
      // partial_refunded. A transient failure on the re-entrant capture replay
      // must NOT roll back to `held` — that would lie about the charge and let a
      // later `refund`/`forfeit` act on an already-captured intent.
      const partialDeposit = makeDeposit({
        status: "partial_refunded",
        stripePaymentIntentId: "pi_test_123",
        refundedAt: new Date(),
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(partialDeposit);
      mockPaymentIntents.capture.mockRejectedValueOnce(new Error("transient network blip"));

      await expect(depositService.refundPartial("dep-123", 3000)).rejects.toThrow(
        /transient network blip/
      );

      // Re-entrant path: no transition (updateMany) and — crucially — no rollback (update).
      expect(mockDepositDb.updateMany).not.toHaveBeenCalled();
      expect(mockDepositDb.update).not.toHaveBeenCalled();
    });

    it("rejects a refund amount greater than the deposit", async () => {
      const heldDeposit = makeDeposit({
        status: "held",
        amountCents: 5000,
        stripePaymentIntentId: "pi_test_123",
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);

      await expect(depositService.refundPartial("dep-123", 6000)).rejects.toThrow(
        /invalid.*amount/i
      );
      expect(mockDepositDb.updateMany).not.toHaveBeenCalled();
      expect(mockPaymentIntents.capture).not.toHaveBeenCalled();
    });

    it("rejects a negative refund amount", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);

      await expect(depositService.refundPartial("dep-123", -1)).rejects.toThrow(/invalid.*amount/i);
      expect(mockDepositDb.updateMany).not.toHaveBeenCalled();
    });

    it("persists feeAmountCents and refundAmountCents on the deposit row at transition time", async () => {
      // The persisted amounts enable safe retry across the no-show boundary.
      const heldDeposit = makeDeposit({
        status: "held",
        amountCents: 10000,
        stripePaymentIntentId: "pi_test_123",
      });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "partial_refunded" }));
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });
      mockPaymentIntents.retrieve.mockResolvedValueOnce({ latest_charge: "ch_1" });
      mockRefunds.create.mockResolvedValueOnce({ id: "re_1", status: "succeeded", amount: 6000 });

      await depositService.refundPartial("dep-123", 6000);

      expect(mockDepositDb.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            feeAmountCents: 4000, // 10000 - 6000
            refundAmountCents: 6000,
          }),
        })
      );
    });

    it("does not call Stripe refund when refundAmountCents is 0 (still transitions + captures)", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "partial_refunded" }));
      mockPaymentIntents.capture.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

      await depositService.refundPartial("dep-123", 0);

      expect(mockPaymentIntents.capture).toHaveBeenCalled();
      expect(mockRefunds.create).not.toHaveBeenCalled();
    });
  });

  describe("CAS concurrency: two different actions on the same held deposit", () => {
    it("exactly one wins the race; the loser throws before calling Stripe", async () => {
      // Simulate: apply races refund on the same held deposit.
      // The winner's updateMany returns { count: 1 }; the loser's returns { count: 0 }.
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      const appliedDeposit = makeDeposit({ status: "applied", appliedAt: new Date() });

      // Both reads see the same held row (concurrent fetch).
      mockDepositDb.findUnique
        .mockResolvedValueOnce(heldDeposit) // apply reads
        .mockResolvedValueOnce(heldDeposit) // refund reads
        .mockResolvedValueOnce(appliedDeposit); // apply's post-CAS fetch

      // apply wins the CAS; refund loses.
      mockDepositDb.updateMany
        .mockResolvedValueOnce({ count: 1 }) // apply wins
        .mockResolvedValueOnce({ count: 0 }); // refund loses

      mockPaymentIntents.capture.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

      const applyPromise = depositService.apply("dep-123");
      const refundPromise = depositService.refund("dep-123");

      const [applyResult, refundError] = await Promise.allSettled([applyPromise, refundPromise]);

      expect(applyResult.status).toBe("fulfilled");
      expect(
        (applyResult as PromiseFulfilledResult<Awaited<ReturnType<typeof depositService.apply>>>)
          .value.status
      ).toBe("applied");

      expect(refundError.status).toBe("rejected");
      expect((refundError as PromiseRejectedResult).reason.message).toMatch(
        /conflict|lost.*race|concurrent/i
      );

      // Stripe called exactly once (the winner's capture); the loser never reached Stripe.
      expect(mockPaymentIntents.capture).toHaveBeenCalledTimes(1);
      expect(mockPaymentIntents.cancel).not.toHaveBeenCalled();
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
