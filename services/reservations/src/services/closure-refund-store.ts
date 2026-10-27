import { prisma } from "./database.js";
import type { ClosureRefundStore } from "./closure-refund.js";

/** Prisma-backed store; runs inside the venue's RLS context (the scoped client). */
export function createPrismaClosureRefundStore(): ClosureRefundStore {
  return {
    load: (outcomeId) =>
      prisma.closureOutcome.findUnique({
        where: { id: outcomeId },
        select: {
          id: true,
          venueId: true,
          reservationId: true,
          dateRuleId: true,
          refund: true,
          reservation: { select: { status: true, cancellationReason: true } },
        },
      }),
    setRefund: async (outcomeId, refund) => {
      await prisma.closureOutcome.update({ where: { id: outcomeId }, data: { refund } });
    },
    resetToPending: async (outcomeId) => {
      await prisma.closureOutcome.updateMany({
        where: { id: outcomeId, refund: "failed" },
        data: { refund: "pending" },
      });
    },
    reopenDone: async (outcomeId) => {
      await prisma.closureOutcome.updateMany({
        where: { id: outcomeId, refund: "done" },
        data: { refund: "pending" },
      });
    },
    markFailed: async (outcomeId) => {
      await prisma.closureOutcome.updateMany({
        where: { id: outcomeId, refund: { notIn: ["done", "none"] } },
        data: { refund: "failed" },
      });
    },
    listByRule: (venueId, ruleId, statuses) =>
      prisma.closureOutcome.findMany({
        where: { venueId, dateRuleId: ruleId, refund: { in: [...statuses] } },
        select: { id: true, reservationId: true, refund: true },
      }),
  };
}

/**
 * Moves a reservation's `done` closure outcome to `failed` after Stripe reports the closure
 * refund failed or was canceled (`charge.refund.updated`). Conditional on `done`, so Stripe
 * redelivery and an outcome already failed / pending / none are left untouched.
 */
export async function markDoneRefundFailed(reservationId: string): Promise<void> {
  await prisma.closureOutcome.updateMany({
    where: { reservationId, refund: "done" },
    data: { refund: "failed" },
  });
}
