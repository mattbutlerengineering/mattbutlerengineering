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
 * redelivery and an outcome already failed / none are left untouched. Returns `"pending"` when
 * the outcome is not `done` yet (the job is between creating the refund and recording it), so
 * the caller can ask Stripe to redeliver.
 */
export async function markDoneRefundFailed(
  reservationId: string
): Promise<"flipped" | "pending" | "unchanged"> {
  const { count } = await prisma.closureOutcome.updateMany({
    where: { reservationId, refund: "done" },
    data: { refund: "failed" },
  });
  if (count > 0) return "flipped";
  const pending = await prisma.closureOutcome.findFirst({
    where: { reservationId, refund: "pending" },
    select: { id: true },
  });
  return pending ? "pending" : "unchanged";
}
