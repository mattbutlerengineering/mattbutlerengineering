import { prisma } from "./database.js";
import type { ClosureOutcomeSweepStore } from "./closure-outcome-sweeper.js";

const SELECT = { id: true, dateRuleId: true, reservationId: true } as const;

/**
 * Reads behind the closure outcome sweeper. Runs through the venue-scoped
 * `prisma`, so the caller must be inside `runWithVenueContext(venueId, …)`
 * (the sweeper is); each query also names `venueId` itself.
 */
export function createPrismaClosureOutcomeSweepStore(): ClosureOutcomeSweepStore {
  return {
    listStuckRefunds: (venueId, olderThan, limit) =>
      prisma.closureOutcome.findMany({
        where: { venueId, refund: "pending", updatedAt: { lt: olderThan } },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: SELECT,
      }),
    listStuckNotices: (venueId, olderThan, limit) =>
      prisma.closureOutcome.findMany({
        where: {
          venueId,
          action: { not: "keep_silent" },
          deliveries: { equals: {} },
          createdAt: { lt: olderThan },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: SELECT,
      }),
  };
}
