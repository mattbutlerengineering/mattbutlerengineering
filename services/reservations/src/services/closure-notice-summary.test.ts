import { describe, expect, it, vi } from "vitest";

vi.mock("./database.js", () => ({ prisma: {} }));

import { listCallList, summarizeOutcomes } from "./closure-notice-store.js";

const row = (over: Record<string, unknown> = {}) => ({
  id: "o-0",
  dateRuleId: "dr-1",
  action: "cancel" as const,
  deliveries: {},
  rebookedReservationId: null,
  refund: "none",
  reservation: {
    guestName: "Rivera",
    deposit: {
      amountCents: 4000,
      currency: "usd",
      status: "applied",
      refundAmountCents: null,
      postCaptureRefundCents: null,
    },
  },
  ...over,
});

describe("summarizeOutcomes", () => {
  it("counts Sent, Rebooked and Unreachable per rule, keeping rules apart", () => {
    const summaries = summarizeOutcomes([
      row({ deliveries: { email: "sent" } }),
      row({ deliveries: { sms: "sent" }, rebookedReservationId: "r-2" }),
      row({ deliveries: { email: "failed", sms: "skipped" } }),
      row({ action: "keep_silent" }),
      row({ dateRuleId: "tonight-1", refund: "pending" }),
    ]);

    expect(summaries).toEqual([
      {
        ruleId: "dr-1",
        total: 4,
        cancelled: 3,
        sent: 2,
        rebooked: 1,
        unreachable: 1,
        refundFailed: 0,
        refundFailures: [],
        refundPending: 0,
      },
      {
        ruleId: "tonight-1",
        total: 1,
        cancelled: 1,
        sent: 0,
        rebooked: 0,
        unreachable: 1,
        refundFailed: 0,
        refundFailures: [],
        refundPending: 1,
      },
    ]);
  });

  it("counts failed and pending refunds, the rows a retry may touch", () => {
    const [summary] = summarizeOutcomes([
      row({ refund: "failed" }),
      row({ refund: "pending" }),
      row({ refund: "done" }),
    ]);

    expect(summary).toMatchObject({ refundFailed: 1, refundPending: 1 });
  });

  it("reports the amount still owed on a partially refunded deposit", () => {
    const deposit = (over: Record<string, unknown>) => ({
      guestName: "Rivera",
      deposit: {
        amountCents: 4000,
        currency: "usd",
        status: "partial_refunded",
        refundAmountCents: 1500,
        postCaptureRefundCents: 500,
        ...over,
      },
    });
    const [summary] = summarizeOutcomes([
      row({ refund: "failed", id: "o-1", reservation: deposit({}) }),
      row({ refund: "failed", id: "o-2", reservation: deposit({ status: "applied" }) }),
      row({ refund: "failed", id: "o-3", reservation: deposit({ postCaptureRefundCents: 9000 }) }),
    ]);

    // own leg 1500 + post-capture 500 come off; a non-partial deposit has no own leg; never negative.
    expect(summary?.refundFailures.map((f) => f.amountCents)).toEqual([2000, 3500, 0]);
  });

  it("names each failed refund with the guest and the amount in minor units, and no contact details", () => {
    const [summary] = summarizeOutcomes([
      row({ refund: "failed", id: "o-1" }),
      row({ refund: "pending" }),
      row({ refund: "failed", id: "o-2", reservation: { guestName: null, deposit: null } }),
    ]);

    expect(summary?.refundFailures).toEqual([
      { outcomeId: "o-1", guestName: "Rivera", amountCents: 4000, currency: "usd" },
      { outcomeId: "o-2", guestName: null, amountCents: null, currency: null },
    ]);
  });
});

describe("listCallList", () => {
  it("lists only guests with no confirmed delivery and no rebooking", async () => {
    const reservation = { guestName: "G", partySize: 2, startTime: new Date(), guestPhone: "1" };
    const db = {
      closureOutcome: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "o1",
            reservationId: "r1",
            action: "cancel",
            deliveries: { email: "sent" },
            rebookedReservationId: null,
            reservation,
          },
          {
            id: "o2",
            reservationId: "r2",
            action: "cancel",
            deliveries: { email: "failed" },
            rebookedReservationId: null,
            reservation,
          },
          {
            id: "o3",
            reservationId: "r3",
            action: "cancel",
            deliveries: {},
            rebookedReservationId: "r9",
            reservation,
          },
          {
            id: "o4",
            reservationId: "r4",
            action: "keep_silent",
            deliveries: {},
            rebookedReservationId: null,
            reservation,
          },
        ]),
      },
    };

    const list = await listCallList("v1", "dr-1", db as never);

    expect(list.map((e) => e.outcomeId)).toEqual(["o2"]);
  });
});
