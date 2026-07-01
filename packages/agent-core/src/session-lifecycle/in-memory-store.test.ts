import { describe, it, expect } from "vitest";
import { createInMemorySessionStore } from "./in-memory-store.js";

describe("createInMemorySessionStore", () => {
  it("creates a session in pending status with defaults applied", async () => {
    const store = createInMemorySessionStore();

    const session = await store.create({ taskDescription: "do the thing" });

    expect(session.id).toBeTruthy();
    expect(session.status).toBe("pending");
    expect(session.taskDescription).toBe("do the thing");
    expect(session.baseBranch).toBe("main");
    expect(session.createPr).toBe(true);
    expect(session.errors).toEqual([]);
  });

  it("honors explicit create inputs", async () => {
    const store = createInMemorySessionStore();

    const session = await store.create({
      taskDescription: "task",
      baseBranch: "develop",
      model: "claude-opus-4-8",
      maxTurns: 10,
      maxBudgetUsd: 2.5,
      createPr: false,
      userId: "user-1",
    });

    expect(session.baseBranch).toBe("develop");
    expect(session.model).toBe("claude-opus-4-8");
    expect(session.maxTurns).toBe(10);
    expect(session.maxBudgetUsd).toBe(2.5);
    expect(session.createPr).toBe(false);
    expect(session.userId).toBe("user-1");
  });

  it("getById returns the stored session and null for unknown ids", async () => {
    const store = createInMemorySessionStore();
    const created = await store.create({ taskDescription: "task" });

    expect(await store.getById(created.id)).toEqual(created);
    expect(await store.getById("missing")).toBeNull();
  });

  it("updateStatus transitions status and merges result fields immutably", async () => {
    const store = createInMemorySessionStore();
    const created = await store.create({ taskDescription: "task" });

    const updated = await store.updateStatus(created.id, "succeeded", {
      branchName: "agent/x",
      prUrl: "https://pr",
      costUsd: 0.42,
      errors: ["none"],
    });

    expect(updated?.status).toBe("succeeded");
    expect(updated?.branchName).toBe("agent/x");
    expect(updated?.prUrl).toBe("https://pr");
    expect(updated?.costUsd).toBe(0.42);
    expect(updated?.errors).toEqual(["none"]);
    // original create object is not mutated
    expect(created.status).toBe("pending");
  });

  it("updateStatus returns null for an unknown session", async () => {
    const store = createInMemorySessionStore();
    expect(await store.updateStatus("missing", "failed")).toBeNull();
  });

  it("updateStatus with opts.fromStatus applies the write when the current status matches", async () => {
    const store = createInMemorySessionStore();
    const created = await store.create({ taskDescription: "task" });
    await store.updateStatus(created.id, "running");

    const updated = await store.updateStatus(created.id, "succeeded", undefined, {
      fromStatus: ["running"],
    });

    expect(updated?.status).toBe("succeeded");
  });

  it("updateStatus with opts.fromStatus returns null and does not mutate on a non-matching status (CAS)", async () => {
    const store = createInMemorySessionStore();
    const created = await store.create({ taskDescription: "task" });
    // created is "pending" — fromStatus expects "running", so this is a lost CAS.
    const result = await store.updateStatus(created.id, "cancelled", undefined, {
      fromStatus: ["running"],
    });

    expect(result).toBeNull();
    const persisted = await store.getById(created.id);
    expect(persisted?.status).toBe("pending");
  });

  it("addEvent records events retrievable via listEvents", async () => {
    const store = createInMemorySessionStore();
    const created = await store.create({ taskDescription: "task" });

    await store.addEvent(created.id, "session:start", { message: "go" });
    await store.addEvent(created.id, "session:complete", { status: "succeeded" });

    expect(store.listEvents(created.id)).toEqual([
      { type: "session:start", data: { message: "go" } },
      { type: "session:complete", data: { status: "succeeded" } },
    ]);
  });
});
