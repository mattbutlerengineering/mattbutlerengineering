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
