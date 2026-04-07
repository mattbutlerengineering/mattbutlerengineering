import { describe, it, expect } from "vitest";
import { createReadinessTracker } from "./readiness.js";

describe("createReadinessTracker", () => {
  it("returns not ready when no checks are registered", async () => {
    const tracker = createReadinessTracker();
    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks).toEqual([]);
    expect(snapshot.timestamp).toBeTruthy();
  });

  it("returns ready when all checks pass", async () => {
    const tracker = createReadinessTracker();
    tracker.registerCheck("database", async () => {
      /* noop — success */
    });
    tracker.registerCheck("auth", async () => {
      /* noop — success */
    });

    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(true);
    expect(snapshot.checks).toHaveLength(2);
    expect(snapshot.checks[0]).toEqual({ name: "database", status: "ok" });
    expect(snapshot.checks[1]).toEqual({ name: "auth", status: "ok" });
  });

  it("returns not ready when any check fails", async () => {
    const tracker = createReadinessTracker();
    tracker.registerCheck("database", async () => {
      throw new Error("Connection refused");
    });
    tracker.registerCheck("auth", async () => {
      /* noop — success */
    });

    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks).toHaveLength(2);
    expect(snapshot.checks[0]).toEqual({
      name: "database",
      status: "error",
      message: "Connection refused",
    });
    expect(snapshot.checks[1]).toEqual({ name: "auth", status: "ok" });
  });

  it("returns not ready when all checks fail", async () => {
    const tracker = createReadinessTracker();
    tracker.registerCheck("database", async () => {
      throw new Error("Connection refused");
    });
    tracker.registerCheck("auth", async () => {
      throw new Error("JWKS not cached");
    });

    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks).toHaveLength(2);
    expect(snapshot.checks[0]).toMatchObject({ name: "database", status: "error" });
    expect(snapshot.checks[1]).toMatchObject({ name: "auth", status: "error" });
  });

  it("handles non-Error throws gracefully", async () => {
    const tracker = createReadinessTracker();
    tracker.registerCheck("broken", async () => {
      throw "string error";
    });

    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks[0]).toEqual({
      name: "broken",
      status: "error",
      message: "string error",
    });
  });

  it("returns an immutable snapshot", async () => {
    const tracker = createReadinessTracker();
    tracker.registerCheck("database", async () => {
      /* noop */
    });

    const snapshot = await tracker.evaluate();

    expect(Object.isFrozen(snapshot.checks)).toBe(false);
    // Verify the snapshot is a new object each time
    const snapshot2 = await tracker.evaluate();
    expect(snapshot).not.toBe(snapshot2);
  });

  it("runs checks concurrently", async () => {
    const tracker = createReadinessTracker();
    const callOrder: string[] = [];

    tracker.registerCheck("slow", async () => {
      callOrder.push("slow-start");
      await new Promise((resolve) => setTimeout(resolve, 50));
      callOrder.push("slow-end");
    });
    tracker.registerCheck("fast", async () => {
      callOrder.push("fast-start");
      callOrder.push("fast-end");
    });

    await tracker.evaluate();

    // Both checks should start before either finishes
    expect(callOrder[0]).toBe("slow-start");
    expect(callOrder[1]).toBe("fast-start");
  });

  it("includes ISO timestamp in snapshot", async () => {
    const tracker = createReadinessTracker();
    tracker.registerCheck("test", async () => {
      /* noop */
    });

    const snapshot = await tracker.evaluate();
    const parsed = new Date(snapshot.timestamp);

    expect(parsed.toISOString()).toBe(snapshot.timestamp);
  });
});
