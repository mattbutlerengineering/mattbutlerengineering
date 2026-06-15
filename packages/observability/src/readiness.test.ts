import { describe, it, expect, vi } from "vitest";
import { createReadinessTracker, registerStandardChecks } from "./readiness.js";

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

describe("registerStandardChecks", () => {
  it("registers database and auth checks — healthy path", async () => {
    const mockPrisma = { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const tracker = createReadinessTracker();

    registerStandardChecks(tracker, {
      prisma: mockPrisma,
      auth0Url: "https://example.auth0.com/.well-known/jwks.json",
      fetchFn: mockFetch,
    });

    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(true);
    expect(snapshot.checks).toHaveLength(2);
    expect(snapshot.checks[0]).toEqual({ name: "database", status: "ok" });
    expect(snapshot.checks[1]).toEqual({ name: "auth", status: "ok" });
    expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("reports database check as error when prisma throws", async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("Connection refused")),
    };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const tracker = createReadinessTracker();

    registerStandardChecks(tracker, {
      prisma: mockPrisma,
      auth0Url: "https://example.auth0.com/.well-known/jwks.json",
      fetchFn: mockFetch,
    });

    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks[0]).toEqual({
      name: "database",
      status: "error",
      message: "Connection refused",
    });
    expect(snapshot.checks[1]).toEqual({ name: "auth", status: "ok" });
  });

  it("reports auth check as error when JWKS fetch times out", async () => {
    const mockPrisma = { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const mockFetch = vi.fn().mockImplementation(
      (_url: string, opts: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          if (opts?.signal) {
            opts.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }
        })
    );
    const tracker = createReadinessTracker();

    registerStandardChecks(tracker, {
      prisma: mockPrisma,
      auth0Url: "https://example.auth0.com/.well-known/jwks.json",
      fetchFn: mockFetch,
      jwksTimeoutMs: 10,
    });

    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks[1]).toMatchObject({
      name: "auth",
      status: "error",
    });
  });

  it("reports auth check as error when JWKS fetch returns non-ok status", async () => {
    const mockPrisma = { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const tracker = createReadinessTracker();

    registerStandardChecks(tracker, {
      prisma: mockPrisma,
      auth0Url: "https://example.auth0.com/.well-known/jwks.json",
      fetchFn: mockFetch,
    });

    const snapshot = await tracker.evaluate();

    expect(snapshot.ready).toBe(false);
    expect(snapshot.checks[1]).toEqual({
      name: "auth",
      status: "error",
      message: "JWKS returned 503",
    });
  });
});
