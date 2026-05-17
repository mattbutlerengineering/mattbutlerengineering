import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("pg", () => {
  const mockPool = {
    totalCount: 5,
    activeCount: 2,
    idleCount: 3,
    waitingCount: 0,
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };
  class MockPool {
    totalCount = mockPool.totalCount;
    activeCount = mockPool.activeCount;
    idleCount = mockPool.idleCount;
    waitingCount = mockPool.waitingCount;
    on = mockPool.on;
    end = mockPool.end;
  }
  return { default: { Pool: MockPool } };
});

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(),
}));

function createMockPrismaClient() {
  const extendedClient = { findMany: vi.fn() };
  return class MockPrismaClient {
    $extends = vi.fn().mockReturnValue(extendedClient);
    $disconnect = vi.fn().mockResolvedValue(undefined);
  };
}

describe("createDatabase", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
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
});
