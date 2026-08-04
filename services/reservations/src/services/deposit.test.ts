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

import { DepositService, calculateDepositAmount } from "./deposit.js";
import { quoteDeposit } from "@mbe/cancellation-policy";
import type { Deposit } from "../generated/prisma/index.js";
import type { DepositType } from "@mbe/cancellation-policy";

/**
 * Inline typed fake for the `StripePort` seam DepositService is injected
 * with. No `vi.mock("stripe")` needed — DepositService never touches the
 * Stripe SDK directly, so tests assert on this fake's calls instead of
 * module-level SDK mocks.
 */
function createMockStripe() {
  return {
    cancelPaymentIntent: vi.fn(),
    capturePaymentIntent: vi.fn(),
    createPartialRefund: vi.fn(),
    createCustomer: vi.fn(),
  };
}

type VenueDepositConfig = { depositType: DepositType | null; depositAmountCents: number | null };

function makeVenueDepositConfig(overrides: Partial<VenueDepositConfig> = {}): VenueDepositConfig {
  return {
    depositType: "flat",
    depositAmountCents: 5000,
    ...overrides,
  };
}

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
  let mockStripe: ReturnType<typeof createMockStripe>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStripe = createMockStripe();
    depositService = new DepositService(mockStripe);
  });

  describe("create", () => {
    it("creates a deposit record in pending state with the payment intent already set", async () => {
      const mockDeposit = makeDeposit({ stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.create.mockResolvedValueOnce(mockDeposit);

      const result = await depositService.create({
        reservationId: "res-123",
        amountCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_test_123",
      });

      // The PaymentIntent id must be written in the single atomic create — no
      // follow-up linkPaymentIntent write that could leave the row orphaned.
      expect(mockDepositDb.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reservationId: "res-123",
            amountCents: 5000,
            currency: "usd",
            status: "pending",
            stripePaymentIntentId: "pi_test_123",
          }),
        })
      );
      expect(result.status).toBe("pending");
      expect(result.stripePaymentIntentId).toBe("pi_test_123");
    });

    it("writes the optional stripeCustomerId atomically when provided", async () => {
      const mockDeposit = makeDeposit({
        stripePaymentIntentId: "pi_test_123",
        stripeCustomerId: "cus_test_123",
      });
      mockDepositDb.create.mockResolvedValueOnce(mockDeposit);

      await depositService.create({
        reservationId: "res-123",
        amountCents: 5000,
        stripePaymentIntentId: "pi_test_123",
        stripeCustomerId: "cus_test_123",
      });

      expect(mockDepositDb.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripePaymentIntentId: "pi_test_123",
            stripeCustomerId: "cus_test_123",
          }),
        })
      );
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
    it("updates deposit to held via a pending-guarded CAS and returns true", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      mockDepositDb.findUnique.mockResolvedValueOnce(pendingDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await depositService.hold("dep-123", "pi_test_123");

      expect(mockDepositDb.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dep-123", status: "pending" },
          data: expect.objectContaining({
            status: "held",
            stripePaymentIntentId: "pi_test_123",
            heldAt: expect.any(Date),
          }),
        })
      );
      expect(result).toBe(true);
    });

    it("returns false without re-transitioning when the CAS races (updateMany returns count 0)", async () => {
      // A concurrent call (e.g. a retried Stripe webhook delivery) already
      // moved the row off `pending` between our read and our write.
      const pendingDeposit = makeDeposit({ status: "pending" });
      mockDepositDb.findUnique.mockResolvedValueOnce(pendingDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race

      const result = await depositService.hold("dep-123", "pi_test_123");

      expect(result).toBe(false);
    });

    it("calling hold() twice does not re-transition the second call (idempotent)", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      mockDepositDb.findUnique.mockResolvedValueOnce(pendingDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      const firstResult = await depositService.hold("dep-123", "pi_test_123");

      // Second call observes the deposit already `held` — transitionDeposit
      // rejects it before ever reaching the CAS.
      const heldDeposit = makeDeposit({ status: "held" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);

      expect(firstResult).toBe(true);
      await expect(depositService.hold("dep-123", "pi_test_123")).rejects.toThrow(
        /invalid.*transition|cannot transition/i
      );
      expect(mockDepositDb.updateMany).toHaveBeenCalledTimes(1);
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
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

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
      expect(mockStripe.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "applied" }));
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

      await depositService.apply("dep-123");

      expect(mockStripe.capturePaymentIntent).toHaveBeenCalledWith("pi_test_123", "dep-123:apply");
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
      mockStripe.capturePaymentIntent.mockImplementationOnce(async () => {
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
      mockStripe.capturePaymentIntent.mockRejectedValueOnce(new Error("stripe boom"));

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
      mockStripe.capturePaymentIntent.mockRejectedValueOnce(new Error("stripe boom"));

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
      mockStripe.cancelPaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "canceled",
      });

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
      expect(mockStripe.cancelPaymentIntent).not.toHaveBeenCalled();
    });

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "refunded" }));
      mockStripe.cancelPaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "canceled",
      });

      await depositService.refund("dep-123");

      expect(mockStripe.cancelPaymentIntent).toHaveBeenCalledWith("pi_test_123", "dep-123:refund");
    });

    it("rolls back DB to held when Stripe cancel fails after the DB update", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(
        makeDeposit({ status: "refunded", refundedAt: new Date() })
      );
      mockDepositDb.update.mockResolvedValueOnce(heldDeposit);
      mockStripe.cancelPaymentIntent.mockRejectedValueOnce(new Error("stripe boom"));

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
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

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
      expect(mockStripe.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it("passes an idempotency key keyed on depositId + action to Stripe", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "forfeited" }));
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

      await depositService.forfeit("dep-123");

      expect(mockStripe.capturePaymentIntent).toHaveBeenCalledWith(
        "pi_test_123",
        "dep-123:forfeit"
      );
    });

    it("rolls back DB to held when Stripe capture fails after the DB update", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(
        makeDeposit({ status: "forfeited", forfeitedAt: new Date() })
      );
      mockDepositDb.update.mockResolvedValueOnce(heldDeposit);
      mockStripe.capturePaymentIntent.mockRejectedValueOnce(new Error("stripe boom"));

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
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });
      mockStripe.createPartialRefund.mockResolvedValueOnce({
        id: "re_1",
        status: "succeeded",
        amount: 3000,
      });

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
      expect(mockStripe.capturePaymentIntent).not.toHaveBeenCalled();
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
      mockStripe.capturePaymentIntent.mockImplementationOnce(async () => {
        order.push("capture");
        return { id: "pi_test_123", status: "succeeded" };
      });
      mockStripe.createPartialRefund.mockImplementationOnce(async () => {
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
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });
      mockStripe.createPartialRefund.mockResolvedValueOnce({
        id: "re_1",
        status: "succeeded",
        amount: 3000,
      });

      await depositService.refundPartial("dep-123", 3000);

      expect(mockStripe.capturePaymentIntent).toHaveBeenCalledWith(
        "pi_test_123",
        "dep-123:refundPartial"
      );
    });

    it("passes a stable idempotency key on the refund", async () => {
      const heldDeposit = makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123" });
      mockDepositDb.findUnique.mockResolvedValueOnce(heldDeposit);
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDepositDb.findUnique.mockResolvedValueOnce(makeDeposit({ status: "partial_refunded" }));
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });
      mockStripe.createPartialRefund.mockResolvedValueOnce({
        id: "re_1",
        status: "succeeded",
        amount: 3000,
      });

      await depositService.refundPartial("dep-123", 3000);

      expect(mockStripe.createPartialRefund).toHaveBeenCalledWith(
        "pi_test_123",
        3000,
        "dep-123:refundPartial:refund"
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
      mockStripe.capturePaymentIntent.mockRejectedValueOnce(new Error("stripe capture boom"));

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
      expect(mockStripe.createPartialRefund).not.toHaveBeenCalled();
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
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });
      mockStripe.createPartialRefund.mockRejectedValueOnce(new Error("stripe refund boom"));

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
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });
      mockStripe.createPartialRefund.mockResolvedValueOnce({
        id: "re_1",
        status: "succeeded",
        amount: 3000,
      });

      const result = await depositService.refundPartial("dep-123", 3000);

      // No DB write on the retry — the row is already partial_refunded.
      expect(mockDepositDb.updateMany).not.toHaveBeenCalled();
      expect(mockDepositDb.update).not.toHaveBeenCalled();
      // Stripe steps replay with their idempotency keys.
      expect(mockStripe.capturePaymentIntent).toHaveBeenCalledWith(
        "pi_test_123",
        "dep-123:refundPartial"
      );
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
      mockStripe.capturePaymentIntent.mockRejectedValueOnce(new Error("transient network blip"));

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
      expect(mockStripe.capturePaymentIntent).not.toHaveBeenCalled();
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
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });
      mockStripe.createPartialRefund.mockResolvedValueOnce({
        id: "re_1",
        status: "succeeded",
        amount: 6000,
      });

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
      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

      await depositService.refundPartial("dep-123", 0);

      expect(mockStripe.capturePaymentIntent).toHaveBeenCalled();
      expect(mockStripe.createPartialRefund).not.toHaveBeenCalled();
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

      mockStripe.capturePaymentIntent.mockResolvedValueOnce({
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
      expect(mockStripe.capturePaymentIntent).toHaveBeenCalledTimes(1);
      expect(mockStripe.cancelPaymentIntent).not.toHaveBeenCalled();
    });
  });

  describe("ensureStripeCustomer", () => {
    it("guest with existing stripeCustomerId returns it directly without calling stripe.createCustomer", async () => {
      const guestWithCustomerId = {
        id: "guest-123",
        stripeCustomerId: "cus_existing_123",
      };
      mockGuestDb.findUnique.mockResolvedValueOnce(guestWithCustomerId);

      const result = await depositService.ensureStripeCustomer(
        "guest-123",
        "test@example.com",
        "Test Guest"
      );

      expect(result).toBe("cus_existing_123");
      expect(mockStripe.createCustomer).not.toHaveBeenCalled();
      expect(mockGuestDb.update).not.toHaveBeenCalled();
    });

    it("guest with no stripeCustomerId creates a new Stripe customer with email, name, and guestId metadata", async () => {
      const guestWithoutCustomerId = {
        id: "guest-123",
        stripeCustomerId: null,
      };
      mockGuestDb.findUnique.mockResolvedValueOnce(guestWithoutCustomerId);
      mockStripe.createCustomer.mockResolvedValueOnce({
        id: "cus_new_456",
      });
      mockGuestDb.update.mockResolvedValueOnce({
        id: "guest-123",
        stripeCustomerId: "cus_new_456",
      });

      const result = await depositService.ensureStripeCustomer(
        "guest-123",
        "test@example.com",
        "Test Guest"
      );

      expect(mockStripe.createCustomer).toHaveBeenCalledWith({
        email: "test@example.com",
        name: "Test Guest",
        metadata: { guestId: "guest-123" },
      });
      expect(mockGuestDb.update).toHaveBeenCalledWith({
        where: { id: "guest-123" },
        data: { stripeCustomerId: "cus_new_456" },
      });
      expect(result).toBe("cus_new_456");
    });

    it("guest not found falls through to create-customer path without throwing", async () => {
      mockGuestDb.findUnique.mockResolvedValueOnce(null);
      mockStripe.createCustomer.mockResolvedValueOnce({
        id: "cus_new_789",
      });
      mockGuestDb.update.mockResolvedValueOnce({
        id: "guest-not-found",
        stripeCustomerId: "cus_new_789",
      });

      const result = await depositService.ensureStripeCustomer(
        "guest-not-found",
        "new@example.com",
        "New Guest"
      );

      expect(mockStripe.createCustomer).toHaveBeenCalledWith({
        email: "new@example.com",
        name: "New Guest",
        metadata: { guestId: "guest-not-found" },
      });
      expect(mockGuestDb.update).toHaveBeenCalledWith({
        where: { id: "guest-not-found" },
        data: { stripeCustomerId: "cus_new_789" },
      });
      expect(result).toBe("cus_new_789");
    });

    it("handles optional email and name parameters (not required)", async () => {
      const guestWithoutCustomerId = {
        id: "guest-minimal",
        stripeCustomerId: null,
      };
      mockGuestDb.findUnique.mockResolvedValueOnce(guestWithoutCustomerId);
      mockStripe.createCustomer.mockResolvedValueOnce({
        id: "cus_minimal_111",
      });
      mockGuestDb.update.mockResolvedValueOnce({
        id: "guest-minimal",
        stripeCustomerId: "cus_minimal_111",
      });

      const result = await depositService.ensureStripeCustomer("guest-minimal");

      expect(mockStripe.createCustomer).toHaveBeenCalledWith({
        email: undefined,
        name: undefined,
        metadata: { guestId: "guest-minimal" },
      });
      expect(result).toBe("cus_minimal_111");
    });
  });
});

describe("calculateDepositAmount", () => {
  it("multiplies depositAmountCents by partySize for per_person type", () => {
    const venue = makeVenueDepositConfig({ depositType: "per_person", depositAmountCents: 1000 });
    expect(calculateDepositAmount(venue, 4)).toBe(4000);
  });

  it("returns depositAmountCents unchanged for flat type", () => {
    const venue = makeVenueDepositConfig({ depositType: "flat", depositAmountCents: 5000 });
    expect(calculateDepositAmount(venue, 4)).toBe(5000);
  });

  it("returns zero when depositAmountCents is null", () => {
    const venue = makeVenueDepositConfig({ depositType: "flat", depositAmountCents: null });
    expect(calculateDepositAmount(venue, 3)).toBe(0);
  });

  it("returns zero when depositAmountCents is null and type is per_person", () => {
    const venue = makeVenueDepositConfig({ depositType: "per_person", depositAmountCents: null });
    expect(calculateDepositAmount(venue, 3)).toBe(0);
  });

  it("returns zero for per_person with zero party size", () => {
    const venue = makeVenueDepositConfig({ depositType: "per_person", depositAmountCents: 1000 });
    expect(calculateDepositAmount(venue, 0)).toBe(0);
  });

  it("handles large party sizes correctly for per_person", () => {
    const venue = makeVenueDepositConfig({ depositType: "per_person", depositAmountCents: 500 });
    expect(calculateDepositAmount(venue, 100)).toBe(50000);
  });

  // MONEY PATH: the service charge and the widget display must never diverge.
  // This asserts the backend's calculateDepositAmount(venue, partySize) and the
  // widget's quoteDeposit(depositConfig, partySize) — the exact function the
  // booking widget imports — agree on the same inputs, for both pricing tiers.
  it.each([
    ["per_person", 1000, 4],
    ["per_person", 500, 1],
    ["flat", 5000, 3],
    ["flat", 0, 2],
  ] as const)(
    "service charge matches widget quote for depositType=%s amountCents=%s partySize=%s",
    (depositType, amountCents, partySize) => {
      const venue = { depositType, depositAmountCents: amountCents };
      const serviceCharge = calculateDepositAmount(venue, partySize);
      const widgetQuote = quoteDeposit({ depositType, amountCents }, partySize);
      expect(serviceCharge).toBe(widgetQuote);
    }
  );
});
