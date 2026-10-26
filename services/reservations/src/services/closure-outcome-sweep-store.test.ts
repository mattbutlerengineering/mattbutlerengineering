import { describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn(async () => []) }));
vi.mock("./database.js", () => ({ prisma: { closureOutcome: { findMany } } }));

const { createPrismaClosureOutcomeSweepStore } = await import("./closure-outcome-sweep-store.js");

const CUTOFF = new Date("2026-10-26T11:55:00Z");

describe("createPrismaClosureOutcomeSweepStore", () => {
  it("lists only pending refunds untouched since the cutoff, oldest first, bounded", async () => {
    await createPrismaClosureOutcomeSweepStore().listStuckRefunds("v1", CUTOFF, 25);

    expect(findMany).toHaveBeenCalledWith({
      where: { venueId: "v1", refund: "pending", updatedAt: { lt: CUTOFF } },
      orderBy: { createdAt: "asc" },
      take: 25,
      select: { id: true, dateRuleId: true, reservationId: true },
    });
  });

  it("lists notifiable outcomes with no delivery recorded, bounded", async () => {
    await createPrismaClosureOutcomeSweepStore().listStuckNotices("v1", CUTOFF, 10);

    expect(findMany).toHaveBeenLastCalledWith({
      where: {
        venueId: "v1",
        action: { not: "keep_silent" },
        deliveries: { equals: {} },
        createdAt: { lt: CUTOFF },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, dateRuleId: true, reservationId: true },
    });
  });
});
