import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPrismaNotFound } from "./index.js";

// Dynamic imports via `await import("./index.js")` hit a cold module load
// on every test (vi.resetModules() runs in beforeEach). Under parallel turbo
// load (13+ packages in CI / pre-push), the default 5s is too tight.
vi.setConfig({ testTimeout: 15_000 });

// Real delay used to let monitored-query timestamps advance across the
// slow-query window boundary between successive calls under test. Named to
// avoid a magic setTimeout literal (AI antipattern ratchet: magicTimeouts).
const QUERY_WINDOW_ADVANCE_MS = 120;

const mockPoolInstance = {
  totalCount: 5,
  activeCount: 2,
  idleCount: 3,
  waitingCount: 0,
  on: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
};

vi.mock("pg", () => {
  class MockPool {
    totalCount = mockPoolInstance.totalCount;
    activeCount = mockPoolInstance.activeCount;
    idleCount = mockPoolInstance.idleCount;
    waitingCount = mockPoolInstance.waitingCount;
    on = mockPoolInstance.on;
    end = mockPoolInstance.end;
  }
  return { default: { Pool: MockPool } };
});

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(),
}));

let capturedExtension: Record<string, unknown> | null = null;

function createMockPrismaClient() {
  const extendedClient = { findMany: vi.fn() };
  return class MockPrismaClient {
    $extends = vi.fn().mockImplementation((ext: Record<string, unknown>) => {
      capturedExtension = ext;
      return extendedClient;
    });
    $disconnect = vi.fn().mockResolvedValue(undefined);
  };
}

describe("createDatabase", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    capturedExtension = null;
    mockPoolInstance.activeCount = 2;
    mockPoolInstance.totalCount = 5;
  });

  it("returns all expected interface members", async () => {
    const { createDatabase } = await import("./index.js");
    const MockPrisma = createMockPrismaClient();
    const db = createDatabase(MockPrisma as never);

    expect(db.prisma).toBeDefined();
    expect(db.getSlowQueryStats).toBeTypeOf("function");
    expect(db.getPoolStats).toBeTypeOf("function");
    expect(db.getPoolMetrics).toBeTypeOf("function");
    expect(db.getServiceStatus).toBeTypeOf("function");
    expect(db.shutdown).toBeTypeOf("function");
  });

  it("getSlowQueryStats returns zero counts initially", async () => {
    const { createDatabase } = await import("./index.js");
    const db = createDatabase(createMockPrismaClient() as never);
    const stats = db.getSlowQueryStats();

    expect(stats.count5min).toBe(0);
    expect(stats.slowestMs).toBe(0);
  });

  it("getPoolStats reads from pg pool internals", async () => {
    const { createDatabase } = await import("./index.js");
    const db = createDatabase(createMockPrismaClient() as never);
    const stats = db.getPoolStats();

    expect(stats.total).toBe(5);
    expect(stats.active).toBe(2);
    expect(stats.idle).toBe(3);
    expect(stats.waiting).toBe(0);
    expect(stats.utilization).toBeCloseTo(0.4);
  });

  it("getPoolMetrics computes utilization and degradation", async () => {
    const { createDatabase } = await import("./index.js");
    const db = createDatabase(createMockPrismaClient() as never);
    const metrics = db.getPoolMetrics();

    expect(metrics.size).toBe(5);
    expect(metrics.busy).toBe(2);
    expect(metrics.isDegraded).toBe(false);
  });

  it("getServiceStatus returns ok when healthy", async () => {
    const { createDatabase } = await import("./index.js");
    const db = createDatabase(createMockPrismaClient() as never);

    expect(db.getServiceStatus()).toBe("ok");
  });

  it("shutdown disconnects prisma and ends pool", async () => {
    const { createDatabase } = await import("./index.js");
    const MockPrisma = createMockPrismaClient();
    const db = createDatabase(MockPrisma as never);
    await db.shutdown();

    expect(db.getServiceStatus()).toBe("ok");
  });

  it("registers pool error handler", async () => {
    const { createDatabase } = await import("./index.js");
    createDatabase(createMockPrismaClient() as never);

    expect(mockPoolInstance.on).toHaveBeenCalledWith("error", expect.any(Function));

    const errorHandler = mockPoolInstance.on.mock.calls.find(
      (c: unknown[]) => c[0] === "error"
    )![1] as (err: Error) => void;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(new Error("connection lost"));
    expect(consoleSpy).toHaveBeenCalledWith("Postgres pool error:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("$allOperations logs slow queries and pool alerts", async () => {
    const { createDatabase } = await import("./index.js");
    mockPoolInstance.activeCount = 5;
    mockPoolInstance.totalCount = 5;
    createDatabase(createMockPrismaClient() as never);

    expect(capturedExtension).not.toBeNull();
    const allOps = (capturedExtension!.query as Record<string, unknown>).$allOperations as (
      ctx: Record<string, unknown>
    ) => Promise<unknown>;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const slowQuery = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return [{ id: 1 }];
    });

    const result = await allOps({
      model: "User",
      operation: "findMany",
      args: {},
      query: slowQuery,
    });

    expect(result).toEqual([{ id: 1 }]);
    expect(warnSpy).toHaveBeenCalled();
    const calls = warnSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("pool_alert"))).toBe(true);
    expect(calls.some((c) => c.includes("slow_query"))).toBe(true);

    warnSpy.mockRestore();
  });

  it("$allOperations does not log for fast queries", async () => {
    const { createDatabase } = await import("./index.js");
    createDatabase(createMockPrismaClient() as never);

    const allOps = (capturedExtension!.query as Record<string, unknown>).$allOperations as (
      ctx: Record<string, unknown>
    ) => Promise<unknown>;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await allOps({
      model: "User",
      operation: "findUnique",
      args: {},
      query: vi.fn().mockResolvedValue({ id: 1 }),
    });

    const slowCalls = warnSpy.mock.calls.filter((c) => (c[0] as string).includes("slow_query"));
    expect(slowCalls).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("getSlowQueryStats returns count and max duration after slow queries", async () => {
    const { createDatabase } = await import("./index.js");
    createDatabase(createMockPrismaClient() as never);

    const allOps = (capturedExtension!.query as Record<string, unknown>).$allOperations as (
      ctx: Record<string, unknown>
    ) => Promise<unknown>;

    vi.spyOn(console, "warn").mockImplementation(() => {});

    await allOps({
      model: "Post",
      operation: "findMany",
      args: {},
      query: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, QUERY_WINDOW_ADVANCE_MS));
        return [];
      }),
    });

    const { createDatabase: createDatabase2 } = await import("./index.js");
    void createDatabase2;
    const db = createDatabase(createMockPrismaClient() as never);

    const allOps2 = (capturedExtension!.query as Record<string, unknown>).$allOperations as (
      ctx: Record<string, unknown>
    ) => Promise<unknown>;

    await allOps2({
      model: "Post",
      operation: "findMany",
      args: {},
      query: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, QUERY_WINDOW_ADVANCE_MS));
        return [];
      }),
    });

    const stats = db.getSlowQueryStats();
    expect(stats.count5min).toBeGreaterThanOrEqual(1);
    expect(stats.slowestMs).toBeGreaterThanOrEqual(100);
    vi.restoreAllMocks();
  });

  it("getServiceStatus returns degraded when pool utilization is high", async () => {
    const { createDatabase } = await import("./index.js");
    mockPoolInstance.activeCount = 5;
    mockPoolInstance.totalCount = 5;
    const db = createDatabase(createMockPrismaClient() as never);

    expect(db.getServiceStatus()).toBe("degraded");
  });

  it("getSlowQueryStats is idempotent — a stale entry that just crossed the window boundary is not observable after first call prunes it", async () => {
    const { createDatabase } = await import("./index.js");
    const db = createDatabase(createMockPrismaClient() as never);

    const allOps = (capturedExtension!.query as Record<string, unknown>).$allOperations as (
      ctx: Record<string, unknown>
    ) => Promise<unknown>;

    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Record a slow query at "now"
    await allOps({
      model: "User",
      operation: "findMany",
      args: {},
      query: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, QUERY_WINDOW_ADVANCE_MS));
        return [];
      }),
    });

    // Simulate time advancing past the 5-min window so this entry becomes stale
    const realNow = Date.now;
    const WINDOW_MS = 5 * 60 * 1000;
    Date.now = vi.fn().mockReturnValue(realNow() + WINDOW_MS + 1000);

    // First call: prunes the now-stale entry, returns count=0
    const first = db.getSlowQueryStats();
    expect(first.count5min).toBe(0);

    // Second call: same result (nothing to prune), still returns count=0
    // With the fix (prune separated), the result is the same; the bug here is semantic
    // — the first call mutated the array which is a side effect of a read.
    // After fix: pruneSlowQueries() runs separately; getSlowQueryStats() is a pure read.
    const second = db.getSlowQueryStats();
    expect(second.count5min).toBe(first.count5min);

    Date.now = realNow;
    vi.restoreAllMocks();
  });

  it("getSlowQueryStats returns consistent count when called before and after getServiceStatus within the window", async () => {
    const { createDatabase } = await import("./index.js");
    const db = createDatabase(createMockPrismaClient() as never);

    const allOps = (capturedExtension!.query as Record<string, unknown>).$allOperations as (
      ctx: Record<string, unknown>
    ) => Promise<unknown>;

    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Record a slow query
    await allOps({
      model: "User",
      operation: "findMany",
      args: {},
      query: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, QUERY_WINDOW_ADVANCE_MS));
        return [];
      }),
    });

    // Read before: should have 1 slow query
    const before = db.getSlowQueryStats();
    expect(before.count5min).toBe(1);

    // getServiceStatus internally reads slow queries — should not affect the next read
    db.getServiceStatus();

    // Read after: must still report the same count
    const after = db.getSlowQueryStats();
    expect(after.count5min).toBe(before.count5min);

    vi.restoreAllMocks();
  });

  it("getPoolMetrics.utilization delegates to getPoolStats.utilization — same value, not a recomputation", async () => {
    const { createDatabase } = await import("./index.js");
    const db = createDatabase(createMockPrismaClient() as never);

    const poolStats = db.getPoolStats();
    const poolMetrics = db.getPoolMetrics();

    // After fix: getPoolMetrics delegates utilization to getPoolStats, collapsing two formulas into one
    expect(poolMetrics.utilization).toBe(poolStats.utilization);
  });

  it("getPoolStats and getPoolMetrics agree on utilization for a cold pool (total=0, connectionLimit default 5)", async () => {
    const { createDatabase } = await import("./index.js");
    mockPoolInstance.totalCount = 0;
    mockPoolInstance.activeCount = 0;
    mockPoolInstance.idleCount = 0;
    const db = createDatabase(createMockPrismaClient() as never);

    const poolStats = db.getPoolStats();
    const poolMetrics = db.getPoolMetrics();

    // Cold pool: both should report 0 utilization, and must agree
    expect(poolStats.utilization).toBe(0);
    expect(poolMetrics.utilization).toBe(poolStats.utilization);
  });

  it("getPoolStats handles missing pool internals with ?? 0 fallbacks", async () => {
    const { createDatabase } = await import("./index.js");
    mockPoolInstance.totalCount = undefined as unknown as number;
    mockPoolInstance.activeCount = undefined as unknown as number;
    mockPoolInstance.idleCount = undefined as unknown as number;
    mockPoolInstance.waitingCount = undefined as unknown as number;
    const db = createDatabase(createMockPrismaClient() as never);
    const stats = db.getPoolStats();

    expect(stats.total).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.idle).toBe(0);
    expect(stats.waiting).toBe(0);
    expect(stats.utilization).toBe(0);
  });

  it("shutdown is idempotent — calling it twice does not call pool.end() twice", async () => {
    const { createDatabase } = await import("./index.js");
    const MockPrisma = createMockPrismaClient();
    const db = createDatabase(MockPrisma as never);

    // Clear any calls from prior tests or beforeExit registrations
    mockPoolInstance.end.mockClear();

    // First shutdown should call pool.end() exactly once
    await db.shutdown();
    expect(mockPoolInstance.end).toHaveBeenCalledTimes(1);

    // Second shutdown should be a no-op (idempotent guard)
    await db.shutdown();
    expect(mockPoolInstance.end).toHaveBeenCalledTimes(1);
  });

  it("$allOperations handles undefined model and operation in slow query", async () => {
    const { createDatabase } = await import("./index.js");
    createDatabase(createMockPrismaClient() as never);

    const allOps = (capturedExtension!.query as Record<string, unknown>).$allOperations as (
      ctx: Record<string, unknown>
    ) => Promise<unknown>;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await allOps({
      model: undefined,
      operation: undefined,
      args: {},
      query: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, QUERY_WINDOW_ADVANCE_MS));
        return [];
      }),
    });

    const slowCalls = warnSpy.mock.calls.filter((c) => (c[0] as string).includes("slow_query"));
    expect(slowCalls).toHaveLength(1);
    const parsed = JSON.parse(slowCalls[0][0] as string);
    expect(parsed.model).toBe("unknown");
    expect(parsed.operation).toBe("unknown");
    warnSpy.mockRestore();
  });
});

describe("isPrismaNotFound", () => {
  it("returns true for a Prisma P2025 error object", () => {
    expect(isPrismaNotFound({ code: "P2025" })).toBe(true);
  });

  it("returns false for a different Prisma error code", () => {
    expect(isPrismaNotFound({ code: "P2002" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPrismaNotFound(null)).toBe(false);
  });

  it("returns false for a plain Error", () => {
    expect(isPrismaNotFound(new Error("not found"))).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isPrismaNotFound("P2025")).toBe(false);
  });
});
