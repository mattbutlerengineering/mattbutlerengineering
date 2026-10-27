import { beforeEach, describe, expect, it, vi } from "vitest";

// Stateful in-memory `prisma.deposit` so the REAL DepositService runs against
// `createInMemoryPayments()` and the money movement can be asserted.
const { depositRows } = vi.hoisted(() => ({
  depositRows: new Map<string, Record<string, unknown>>(),
}));

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      deposit: {
        findUnique: vi.fn(async ({ where }: { where: { id?: string; reservationId?: string } }) => {
          const row = where.id
            ? depositRows.get(where.id)
            : [...depositRows.values()].find((r) => r.reservationId === where.reservationId);
          return row ? { ...row } : null;
        }),
        findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({
          reservationId: depositRows.get(where.id)?.reservationId ?? "res-1",
        })),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; status: string };
            data: Record<string, unknown>;
          }) => {
            const row = depositRows.get(where.id);
            if (!row || row.status !== where.status) return { count: 0 };
            depositRows.set(where.id, { ...row, ...data });
            return { count: 1 };
          }
        ),
      },
      reservationEvent: { create: vi.fn() },
    },
  });
});
vi.mock("../middleware/venue-context.js", () => ({ setVenueContext: vi.fn() }));

import { DepositService, DepositTransitionError } from "./deposit.js";
import { StripeOperationError } from "./stripe.js";
import { createInMemoryPayments } from "../transitions/in-memory.js";
import {
  ClosureRefundEnqueueError,
  closureRefundJobId,
  enqueueClosureRefunds,
  runClosureRefundJob,
  settleClosureRefund,
  type ClosureRefundRow,
  type ClosureRefundStore,
} from "./closure-refund.js";

const PAYLOAD = { outcomeId: "out-1", venueId: "venue-1" };

function makeStore(overrides: Partial<ClosureRefundRow> = {}) {
  const row: ClosureRefundRow = {
    id: "out-1",
    venueId: "venue-1",
    reservationId: "res-1",
    dateRuleId: "rule-1",
    refund: "pending",
    reservation: { status: "CANCELLED", cancellationReason: "venue_closure" },
    ...overrides,
  };
  const state = { row };
  const store: ClosureRefundStore = {
    load: vi.fn(async () => state.row),
    setRefund: vi.fn(async (_id, refund) => {
      state.row = { ...state.row, refund };
    }),
    reopenDone: vi.fn(async () => {
      if (state.row.refund === "done") state.row = { ...state.row, refund: "pending" };
    }),
    resetToPending: vi.fn(async () => {
      if (state.row.refund === "failed") {
        state.row = { ...state.row, refund: "pending" };
      }
    }),
    markFailed: vi.fn(async () => {
      if (state.row.refund === "done" || state.row.refund === "none") return;
      state.row = { ...state.row, refund: "failed" };
    }),
    listByRule: vi.fn(async () => [
      { id: "out-1", reservationId: "res-1", refund: state.row.refund },
    ]),
  };
  return { store, state };
}

function seedDeposit(fields: Record<string, unknown> = {}) {
  depositRows.set("dep-1", {
    id: "dep-1",
    reservationId: "res-1",
    amountCents: 5000,
    currency: "usd",
    status: "held",
    stripePaymentIntentId: "pi_1",
    refundAmountCents: null,
    postCaptureRefundCents: null,
    ...fields,
  });
}

function setup(rowOverrides: Partial<ClosureRefundRow> = {}) {
  const payments = createInMemoryPayments();
  const { store, state } = makeStore(rowOverrides);
  const deps = { deposits: new DepositService(payments), payments, store };
  return { payments, store, state, deps };
}

const stripeOps = (p: ReturnType<typeof createInMemoryPayments>) =>
  p.calls.filter(
    (c) =>
      c.op !== "retrievePaymentIntent" &&
      c.op !== "findDepositRefund" &&
      c.op !== "getChargeAmounts" &&
      c.op !== "countFailedDepositRefunds"
  );

beforeEach(() => depositRows.clear());

describe("settleClosureRefund", () => {
  it("refunds a held deposit through DepositService and marks the outcome done", async () => {
    seedDeposit();
    const { deps, payments, state } = setup();

    await settleClosureRefund(deps, PAYLOAD);

    expect(depositRows.get("dep-1")?.status).toBe("refunded");
    expect(stripeOps(payments)).toEqual([
      { op: "cancelPaymentIntent", args: ["pi_1", "dep-1:refund"] },
    ]);
    expect(state.row.refund).toBe("done");
  });

  it("resolves a pending deposit whose authorization landed: hold, then refund", async () => {
    seedDeposit({ status: "pending" });
    const { deps, payments, state } = setup();

    await settleClosureRefund(deps, PAYLOAD);

    expect(depositRows.get("dep-1")?.status).toBe("refunded");
    expect(stripeOps(payments)).toEqual([
      { op: "cancelPaymentIntent", args: ["pi_1", "dep-1:refund"] },
    ]);
    expect(state.row.refund).toBe("done");
  });

  it("voids the intent of a pending deposit the guest never authorized; nothing was charged", async () => {
    seedDeposit({ status: "pending" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "requires_payment_method" }));

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments)).toEqual([
      { op: "cancelPaymentIntent", args: ["pi_1", "dep-1:refund"] },
    ]);
    expect(state.row.refund).toBe("none");
  });

  it("settles an uncollectable deposit with no Stripe call", async () => {
    seedDeposit({ status: "uncollectable" });
    const { deps, payments, state } = setup();

    await settleClosureRefund(deps, PAYLOAD);

    expect(payments.calls).toEqual([]);
    expect(state.row.refund).toBe("none");
  });

  it("settles a refunded deposit whose intent is already canceled with no cancel call", async () => {
    seedDeposit({ status: "refunded" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "canceled" }));

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments)).toEqual([]);
    expect(state.row.refund).toBe("done");
  });

  it("cancels a still-live authorization on a refunded deposit (crash after the row write)", async () => {
    seedDeposit({ status: "refunded" });
    const { deps, payments, state } = setup();
    // default in-memory retrieve: requires_capture

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments)).toEqual([
      { op: "cancelPaymentIntent", args: ["pi_1", "dep-1:refund"] },
    ]);
    expect(depositRows.get("dep-1")?.status).toBe("refunded");
    expect(state.row.refund).toBe("done");
  });

  it("does not mark a refunded deposit done when cancelling its live authorization fails", async () => {
    seedDeposit({ status: "refunded" });
    const { deps, payments, state } = setup();
    payments.failNext("cancelPaymentIntent", "StripeConnectionError");

    await expect(settleClosureRefund(deps, PAYLOAD)).rejects.toThrow();

    expect(state.row.refund).toBe("pending");
  });

  it.each(["succeeded", "processing"])(
    "fails permanently, never done, when a refunded deposit's intent is %s",
    async (intentStatus) => {
      seedDeposit({ status: "refunded" });
      const { deps, payments, state } = setup();
      payments.respond("retrievePaymentIntent", (id) => ({ id, status: intentStatus }));

      await expect(
        runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })
      ).rejects.toMatchObject({ name: "ClosureRefundPermanentError" });

      expect(state.row.refund).toBe("failed");
      expect(stripeOps(payments)).toEqual([]);
    }
  );

  it("keeps the outcome pending and rethrows when retrieving a refunded deposit's intent fails", async () => {
    seedDeposit({ status: "refunded" });
    const { deps, payments, state } = setup();
    payments.failNext("retrievePaymentIntent", "StripeRateLimitError");

    await expect(
      runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })
    ).rejects.toMatchObject({ stripeType: "StripeRateLimitError" });

    expect(state.row.refund).toBe("pending");
  });

  it("settles a refunded deposit with no payment intent without a Stripe call", async () => {
    seedDeposit({ status: "refunded", stripePaymentIntentId: null });
    const { deps, payments, state } = setup();

    await settleClosureRefund(deps, PAYLOAD);

    expect(payments.calls).toEqual([]);
    expect(state.row.refund).toBe("done");
  });

  it("owes the full amount when a closure refund failed at Stripe, though the webhook-fed column counted it", async () => {
    seedDeposit({ status: "forfeited", postCaptureRefundCents: 5000 });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.respond("getChargeAmounts", () => ({ capturedCents: 5000, refundedCents: 0 })); // the failed refund is not counted

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments).map((c) => c.args.slice(0, 2))).toEqual([["pi_1", 5000]]);
    expect(state.row.refund).toBe("done");
  });

  it("settles done without a refund when Stripe already shows the whole charge refunded", async () => {
    seedDeposit({ status: "applied" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.respond("getChargeAmounts", () => ({ capturedCents: 5000, refundedCents: 5000 }));

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments).filter((c) => c.op === "createPartialRefund")).toEqual([]);
    expect(state.row.refund).toBe("done");
  });

  it.each(["amount_too_large", "charge_already_refunded"])(
    "keeps a %s rejection retriable, so a later run recomputes the amount",
    async (code) => {
      seedDeposit({ status: "forfeited" });
      const { deps, payments, state } = setup();
      payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
      payments.failNext("createPartialRefund", "StripeInvalidRequestError", code);

      await expect(
        runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })
      ).rejects.not.toMatchObject({ name: "ClosureRefundPermanentError" });

      expect(state.row.refund).toBe("pending");
    }
  );

  it("does not trust refund=done while the deposit is still held: it releases the authorization", async () => {
    seedDeposit({ status: "held" });
    const { deps, payments, state } = setup({ refund: "done" });

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments).map((c) => c.op)).toEqual(["cancelPaymentIntent"]);
    expect(depositRows.get("dep-1")?.status).toBe("refunded");
    expect(state.row.refund).toBe("done");
  });

  it("recovers from the Retry vs cancel-failure race: done recorded, then the rollback to held", async () => {
    seedDeposit({ status: "held" });
    const { deps, payments, state } = setup();
    let intentStatus = "requires_capture";
    let raced = false;
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: intentStatus }));
    payments.respond("cancelPaymentIntent", async (id) => {
      if (!raced) {
        raced = true;
        // Runner B (Manager Retry) runs now: it sees the deposit refunded and the
        // intent void, and records done. Then A's cancel fails.
        intentStatus = "canceled";
        await settleClosureRefund(deps, PAYLOAD);
        intentStatus = "requires_capture";
        throw new Error("stripe unreachable");
      }
      intentStatus = "canceled";
      return { id, status: "canceled" };
    });

    await expect(settleClosureRefund(deps, PAYLOAD)).rejects.toThrow("stripe unreachable");
    expect(depositRows.get("dep-1")?.status).toBe("held"); // rolled back
    expect(state.row.refund).toBe("done"); // B's write: the lie

    await settleClosureRefund(deps, PAYLOAD); // A's retry

    expect(intentStatus).toBe("canceled");
    expect(depositRows.get("dep-1")?.status).toBe("refunded");
    expect(state.row.refund).toBe("done");
  });

  it("keeps a message-only 'greater than unrefunded amount' rejection retriable", async () => {
    seedDeposit({ status: "forfeited" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.respond("createPartialRefund", () => {
      const cause = Object.assign(
        new Error("Refund amount ($50.00) is greater than unrefunded amount on charge"),
        { type: "StripeInvalidRequestError" }
      );
      throw new StripeOperationError(cause, "StripeInvalidRequestError", false);
    });

    await expect(
      runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })
    ).rejects.not.toMatchObject({ name: "ClosureRefundPermanentError" });

    expect(state.row.refund).toBe("pending");
  });

  it("refunds at most what was captured when the dashboard captured less than the deposit", async () => {
    seedDeposit({ status: "applied" });
    const { deps, payments } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.respond("getChargeAmounts", () => ({ capturedCents: 3000, refundedCents: 500 }));

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments).map((c) => c.args.slice(1, 4))).toEqual([
      [2500, "dep-1", "dep-1:closureRefund:2500"],
    ]);
  });

  it("uses a fresh key after an earlier closure refund failed at Stripe, so the cached pending refund is not replayed", async () => {
    seedDeposit({ status: "forfeited" });
    const { deps, payments } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.respond("countFailedDepositRefunds", () => 1);

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments).map((c) => c.args[3])).toEqual(["dep-1:closureRefund:5000:1"]);
  });

  it("records failed, not done, when re-releasing a done-but-held deposit fails permanently", async () => {
    seedDeposit({ status: "held" });
    const { deps, payments, state } = setup({ refund: "done" });
    payments.failNext("cancelPaymentIntent", "StripeInvalidRequestError");
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));

    await expect(
      runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })
    ).rejects.toMatchObject({ name: "ClosureRefundPermanentError" });

    expect(state.row.refund).toBe("failed");
  });

  it("records failed, not done, when re-releasing a done-but-held deposit fails on the final attempt", async () => {
    seedDeposit({ status: "held" });
    const { deps, payments, state } = setup({ refund: "done" });
    payments.failNext("cancelPaymentIntent", "StripeConnectionError");

    await expect(
      runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: true })
    ).rejects.toBeDefined();

    expect(state.row.refund).toBe("failed");
  });

  it("fails permanently, not in a retry loop, when a held deposit was captured outside the app", async () => {
    seedDeposit({ status: "held" });
    const { deps, payments, state } = setup();
    payments.failNext("cancelPaymentIntent", "StripeInvalidRequestError");
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));

    await expect(
      runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })
    ).rejects.toMatchObject({
      name: "ClosureRefundPermanentError",
    });

    expect(state.row.refund).toBe("failed");
    expect(stripeOps(payments).map((c) => c.op)).toEqual(["cancelPaymentIntent"]);
    expect(depositRows.get("dep-1")?.status).toBe("held");
  });

  it.each([
    "StripeCardError",
    "StripeInvalidRequestError",
    "StripeAuthenticationError",
    "StripePermissionError",
  ])("fails fast, with a clear message, on a non-retriable %s from the refund", async (type) => {
    seedDeposit({ status: "forfeited" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.failNext("createPartialRefund", type);

    await expect(
      runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })
    ).rejects.toMatchObject({
      name: "ClosureRefundPermanentError",
      message: expect.stringContaining(type),
    });

    expect(state.row.refund).toBe("failed");
  });

  it.each(["StripeConnectionError", "StripeRateLimitError", "StripeAPIError"])(
    "keeps retrying a transient %s",
    async (type) => {
      seedDeposit({ status: "forfeited" });
      const { deps, payments, state } = setup();
      payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
      payments.failNext("createPartialRefund", type);

      await expect(
        runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })
      ).rejects.not.toMatchObject({ name: "ClosureRefundPermanentError" });

      expect(state.row.refund).toBe("pending");
    }
  );

  it("settles a closure outcome with no deposit as none", async () => {
    const { deps, payments, state } = setup();
    await settleClosureRefund(deps, PAYLOAD);
    expect(payments.calls).toEqual([]);
    expect(state.row.refund).toBe("none");
  });

  it("refunds a forfeited venue_closure deposit in full through Stripe's refund API", async () => {
    seedDeposit({ status: "forfeited" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments)).toEqual([
      {
        op: "createPartialRefund",
        args: ["pi_1", 5000, "dep-1", "dep-1:closureRefund:5000", "closureRefund"],
      },
    ]);
    expect(state.row.refund).toBe("done");
  });

  it("keys the closure refund by amount, so a corrected smaller amount is not blocked by a rejected over-amount attempt", async () => {
    seedDeposit({ status: "forfeited" });
    const { deps, payments } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.failNext("createPartialRefund", "StripeInvalidRequestError", "amount_too_large");

    await expect(settleClosureRefund(deps, PAYLOAD)).rejects.toBeDefined();
    // Stripe now reports the 2000 dashboard refund: the guest is owed 2000 less.
    payments.respond("getChargeAmounts", () => ({ capturedCents: 5000, refundedCents: 2000 }));
    await settleClosureRefund(deps, PAYLOAD);

    const keys = stripeOps(payments).map((c) => c.args[3]);
    expect(keys).toEqual(["dep-1:closureRefund:5000", "dep-1:closureRefund:3000"]);
  });

  it("reuses the same key when a retry owes the same amount", async () => {
    seedDeposit({ status: "forfeited" });
    const { deps, payments } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.failNext("createPartialRefund", "StripeConnectionError");

    await expect(settleClosureRefund(deps, PAYLOAD)).rejects.toBeDefined();
    await settleClosureRefund(deps, PAYLOAD);

    const keys = stripeOps(payments).map((c) => c.args[3]);
    expect(keys).toEqual(["dep-1:closureRefund:5000", "dep-1:closureRefund:5000"]);
  });

  it("refunds only the fee a partial_refunded deposit kept, net of Stripe's own leg", async () => {
    seedDeposit({ status: "partial_refunded", refundAmountCents: 2000 });
    const { deps, payments } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    // Stripe's total already includes the refundPartial leg.
    payments.respond("getChargeAmounts", () => ({ capturedCents: 5000, refundedCents: 2000 }));

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments).map((c) => c.args[1])).toEqual([3000]);
  });

  it("does not refund a captured deposit twice when the closure refund already exists at Stripe", async () => {
    seedDeposit({ status: "applied" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.respond("findDepositRefund", (_pi, _dep, leg) =>
      leg === "closureRefund" ? { id: "re_closure", amount: 5000 } : null
    );

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments)).toEqual([]);
    expect(state.row.refund).toBe("done");
  });

  it.each(["forfeited", "applied", "partial_refunded"])(
    "releases the hold and writes a %s deposit off as uncollectable when its capture never landed",
    async (status) => {
      seedDeposit({ status, refundAmountCents: status === "partial_refunded" ? 2000 : null });
      const { deps, payments, state } = setup();

      await settleClosureRefund(deps, PAYLOAD);

      expect(stripeOps(payments).map((c) => c.op)).toEqual(["cancelPaymentIntent"]);
      expect(depositRows.get("dep-1")?.status).toBe("uncollectable");
      expect(state.row.refund).toBe("done");
    }
  );

  it("writes off a forfeited deposit whose intent is already canceled (a retry after the cancel)", async () => {
    seedDeposit({ status: "forfeited" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "canceled" }));

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments)).toEqual([]);
    expect(depositRows.get("dep-1")?.status).toBe("uncollectable");
    expect(state.row.refund).toBe("none");
  });

  it("re-reads and refunds the captured money when a late-cancel forfeits a held deposit mid-job", async () => {
    seedDeposit({ status: "held" });
    const { deps, payments, state } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    const read = deps.deposits.getByReservationId.bind(deps.deposits);
    vi.spyOn(deps.deposits, "getByReservationId").mockImplementationOnce(async (id) => {
      const seen = await read(id);
      // The guest's late-cancel lands between the job's read and refund()'s re-read.
      depositRows.set("dep-1", { ...depositRows.get("dep-1"), status: "forfeited" });
      return seen;
    });

    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments)).toEqual([
      {
        op: "createPartialRefund",
        args: ["pi_1", 5000, "dep-1", "dep-1:closureRefund:5000", "closureRefund"],
      },
    ]);
    expect(state.row.refund).toBe("done");
  });

  it("re-reads and refunds when the authorization webhook holds a pending deposit mid-job", async () => {
    seedDeposit({ status: "pending" });
    const { deps, payments, state } = setup();
    const read = deps.deposits.getByReservationId.bind(deps.deposits);
    vi.spyOn(deps.deposits, "getByReservationId").mockImplementationOnce(async (id) => {
      const seen = await read(id);
      // amount_capturable_updated lands between the job's read and hold()'s re-read.
      depositRows.set("dep-1", { ...depositRows.get("dep-1"), status: "held" });
      return seen;
    });

    await settleClosureRefund(deps, PAYLOAD);

    expect(depositRows.get("dep-1")?.status).toBe("refunded");
    expect(stripeOps(payments)).toEqual([
      { op: "cancelPaymentIntent", args: ["pi_1", "dep-1:refund"] },
    ]);
    expect(state.row.refund).toBe("done");
  });

  it("leaves a captured deposit on a reservation the closure did not cancel alone", async () => {
    seedDeposit({ status: "forfeited" });
    const { deps, payments, state } = setup({
      reservation: { status: "CANCELLED", cancellationReason: "guest_request" },
    });

    await settleClosureRefund(deps, PAYLOAD);

    expect(payments.calls).toEqual([]);
    expect(state.row.refund).toBe("none");
  });

  it("a second run after done makes no Stripe call (duplicate job, one refund)", async () => {
    seedDeposit();
    const { deps, payments } = setup();

    await settleClosureRefund(deps, PAYLOAD);
    await settleClosureRefund(deps, PAYLOAD);

    expect(stripeOps(payments)).toHaveLength(1);
  });
});

describe("runClosureRefundJob", () => {
  it("keeps the outcome pending on a retryable Stripe failure before the final attempt", async () => {
    seedDeposit();
    const { deps, payments, state } = setup();
    payments.failNext("cancelPaymentIntent", "StripeConnectionError");

    await expect(runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false })).rejects.toThrow();

    expect(state.row.refund).toBe("pending");
  });

  it("marks the outcome failed on the final attempt, and a later retry can finish it", async () => {
    seedDeposit();
    const { deps, payments, state } = setup();
    payments.failNext("cancelPaymentIntent", "StripeConnectionError");

    await expect(runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: true })).rejects.toThrow();
    expect(state.row.refund).toBe("failed");

    await runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: true });
    expect(state.row.refund).toBe("done");
    expect(depositRows.get("dep-1")?.status).toBe("refunded");
  });

  it("retries, never fails permanently, when the deposit keeps moving under it", async () => {
    seedDeposit({ status: "held" });
    const { deps, state } = setup();
    vi.spyOn(deps.deposits, "refund").mockRejectedValue(
      new DepositTransitionError("applied", "refunded", [], "deposit")
    );

    const run = runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: false });

    await expect(run).rejects.toThrow(/kept changing/);
    await expect(run).rejects.not.toMatchObject({ name: "ClosureRefundPermanentError" });
    expect(deps.deposits.refund).toHaveBeenCalledTimes(3);
    expect(state.row.refund).toBe("pending");
  });

  it("does not overwrite an outcome a concurrent run already marked done", async () => {
    seedDeposit();
    const { deps, payments, state, store } = setup();
    payments.failNext("cancelPaymentIntent", "StripeConnectionError");
    vi.mocked(store.load).mockImplementationOnce(async () => {
      const seen = state.row;
      state.row = { ...state.row, refund: "done" }; // the other run finishes first
      return seen;
    });

    await expect(runClosureRefundJob(deps, PAYLOAD, { isFinalAttempt: true })).rejects.toThrow();

    expect(store.setRefund).not.toHaveBeenCalledWith("out-1", "failed");
    expect(state.row.refund).toBe("done");
  });
});

describe("enqueueClosureRefunds", () => {
  it("schedules one job per listed outcome keyed closure:<ruleId>:<reservationId>", async () => {
    const { store } = makeStore();
    const schedule = vi.fn(async (..._args: unknown[]) => "id");

    await enqueueClosureRefunds({ store, jobs: { schedule } }, "venue-1", "rule-1", ["pending"]);

    expect(schedule).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledWith(
      "closure-refund",
      { outcomeId: "out-1", venueId: "venue-1" },
      0,
      closureRefundJobId("rule-1", "res-1")
    );
    expect(closureRefundJobId("rule-1", "res-1")).not.toContain(":");
  });

  it("a retry resets failed outcomes to pending and uses a fresh job id", async () => {
    const { store } = makeStore({ refund: "failed" });
    const schedule = vi.fn(async (..._args: unknown[]) => "id");

    await enqueueClosureRefunds({ store, jobs: { schedule } }, "venue-1", "rule-1", ["failed"], {
      retry: true,
    });

    expect(store.resetToPending).toHaveBeenCalledWith("out-1");
    expect(schedule.mock.calls[0]?.[3]).not.toBe(closureRefundJobId("rule-1", "res-1"));
  });

  it("a retry whose schedule fails puts a failed row back to failed, and reports how many were queued", async () => {
    const { store, state } = makeStore({ refund: "failed" });
    store.listByRule = vi.fn(async () => [
      { id: "out-0", reservationId: "res-0", refund: "failed" as const },
      { id: "out-1", reservationId: "res-1", refund: "failed" as const },
    ]);
    const schedule = vi
      .fn<(...args: unknown[]) => Promise<string>>()
      .mockResolvedValueOnce("id")
      .mockRejectedValueOnce(new Error("redis down"));

    const error = await enqueueClosureRefunds(
      { store, jobs: { schedule } },
      "venue-1",
      "rule-1",
      ["failed", "pending"],
      { retry: true }
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ClosureRefundEnqueueError);
    expect((error as ClosureRefundEnqueueError).enqueued).toBe(1);
    expect(store.markFailed).toHaveBeenCalledTimes(1);
    expect(store.markFailed).toHaveBeenCalledWith("out-1");
    expect(state.row.refund).toBe("failed");
  });

  it("logs, rather than swallows, a failure to restore the row", async () => {
    const { store } = makeStore({ refund: "failed" });
    store.markFailed = vi.fn(async () => {
      throw new Error("db down");
    });
    const log = { error: vi.fn() };
    const schedule = vi.fn(async (..._args: unknown[]) => {
      throw new Error("redis down");
    });

    await enqueueClosureRefunds(
      { store, jobs: { schedule }, log },
      "venue-1",
      "rule-1",
      ["failed"],
      { retry: true }
    ).catch(() => undefined);

    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", ruleId: "rule-1", outcomeId: "out-1" }),
      expect.any(String)
    );
  });

  it("a retry whose schedule fails leaves a row that was only pending pending", async () => {
    const { store, state } = makeStore({ refund: "pending" });
    const schedule = vi.fn(async (..._args: unknown[]) => {
      throw new Error("redis down");
    });

    await enqueueClosureRefunds({ store, jobs: { schedule } }, "venue-1", "rule-1", ["pending"], {
      retry: true,
    }).catch(() => undefined);

    expect(store.markFailed).not.toHaveBeenCalled();
    expect(state.row.refund).toBe("pending");
  });

  it("a retry resets the row before scheduling, so a job that fails at once stays failed", async () => {
    const { store, state } = makeStore({ refund: "failed" });
    const order: string[] = [];
    const reset = store.resetToPending;
    store.resetToPending = vi.fn(async (id: string) => {
      order.push("reset");
      await reset(id);
    });
    // The job fails permanently the moment it exists: its markFailed runs inside schedule.
    const schedule = vi.fn(async (..._args: unknown[]) => {
      order.push("schedule");
      await store.markFailed("out-1");
      return "id";
    });

    await enqueueClosureRefunds({ store, jobs: { schedule } }, "venue-1", "rule-1", ["failed"], {
      retry: true,
    });

    expect(order).toEqual(["reset", "schedule"]);
    expect(state.row.refund).toBe("failed");
  });

  it("a reset that throws schedules nothing for that outcome and counts only earlier ones", async () => {
    const { store } = makeStore({ refund: "failed" });
    store.resetToPending = vi.fn(async () => {
      throw new Error("db down");
    });
    const schedule = vi.fn(async (..._args: unknown[]) => "id");

    const error = await enqueueClosureRefunds(
      { store, jobs: { schedule } },
      "venue-1",
      "rule-1",
      ["failed"],
      { retry: true }
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ClosureRefundEnqueueError);
    expect((error as ClosureRefundEnqueueError).enqueued).toBe(0);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("the reset never turns a row that settled meanwhile back into pending", async () => {
    const { store, state } = makeStore({ refund: "done" });
    const schedule = vi.fn(async (..._args: unknown[]) => "id");

    await enqueueClosureRefunds({ store, jobs: { schedule } }, "venue-1", "rule-1", ["failed"], {
      retry: true,
    });

    expect(state.row.refund).toBe("done");
  });
});
