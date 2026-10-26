import { describe, expect, it, vi } from "vitest";

const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn(async () => ({ count: 0 })) }));
vi.mock("./database.js", () => ({ prisma: { closureOutcome: { updateMany } } }));

const { createPrismaClosureRefundStore } = await import("./closure-refund-store.js");

describe("createPrismaClosureRefundStore.markFailed", () => {
  it("records failed only on an outcome not already settled", async () => {
    await createPrismaClosureRefundStore().markFailed("out-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "out-1", refund: { notIn: ["done", "none"] } },
      data: { refund: "failed" },
    });
  });
});
