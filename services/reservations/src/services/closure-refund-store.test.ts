import { describe, expect, it, vi } from "vitest";

const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn(async () => ({ count: 0 })) }));
vi.mock("./database.js", () => ({ prisma: { closureOutcome: { updateMany } } }));

const { createPrismaClosureRefundStore } = await import("./closure-refund-store.js");

describe("createPrismaClosureRefundStore.resetToPending", () => {
  it("only moves a failed outcome, never a pending or settled one", async () => {
    await createPrismaClosureRefundStore().resetToPending("out-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "out-1", refund: "failed" },
      data: { refund: "pending" },
    });
  });
});

describe("createPrismaClosureRefundStore.markFailed", () => {
  it("records failed only on an outcome not already settled", async () => {
    await createPrismaClosureRefundStore().markFailed("out-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "out-1", refund: { notIn: ["done", "none"] } },
      data: { refund: "failed" },
    });
  });
});

describe("createPrismaClosureRefundStore.reopenDone", () => {
  it("moves only a done outcome back to pending", async () => {
    await createPrismaClosureRefundStore().reopenDone("out-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "out-1", refund: "done" },
      data: { refund: "pending" },
    });
  });
});
