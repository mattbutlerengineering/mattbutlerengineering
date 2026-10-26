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
import { createInMemoryPayments } from "../transitions/in-memory.js";
import {
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
    markFailed: vi.fn(async () => {
      if (state.row.refund === "done" || state.row.refund === "none") return;
      state.row = { ...state.row, refund: "failed" };
    }),
    listByRule: vi.fn(async () => [{ id: "out-1", reservationId: "res-1" }]),
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
  p.calls.filter((c) => c.op !== "retrievePaymentIntent" && c.op !== "findDepositRefund");

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

  it.each([
    ["refunded", "done"],
    ["uncollectable", "none"],
  ])("settles a %s deposit with no Stripe call (outcome %s)", async (status, expected) => {
    seedDeposit({ status });
    const { deps, payments, state } = setup();

    await settleClosureRefund(deps, PAYLOAD);

    expect(payments.calls).toEqual([]);
    expect(state.row.refund).toBe(expected);
  });

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
        args: ["pi_1", 5000, "dep-1", "dep-1:closureRefund", "closureRefund"],
      },
    ]);
    expect(state.row.refund).toBe("done");
  });

  it("refunds only the fee a partial_refunded deposit kept, net of Stripe's own leg", async () => {
    seedDeposit({ status: "partial_refunded", refundAmountCents: 2000 });
    const { deps, payments } = setup();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.respond("findDepositRefund", (_pi, _dep, leg) =>
      leg === "refundPartial" ? { id: "re_own", amount: 2000 } : null
    );

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
        args: ["pi_1", 5000, "dep-1", "dep-1:closureRefund", "closureRefund"],
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

    expect(store.setRefund).toHaveBeenCalledWith("out-1", "pending");
    expect(schedule.mock.calls[0]?.[3]).not.toBe(closureRefundJobId("rule-1", "res-1"));
  });
});
