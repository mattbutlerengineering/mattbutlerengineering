import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted runs before vi.mock factories — use it for shared state that the
// mock class constructors reference at module-load time.
// ---------------------------------------------------------------------------
const { mockPoolOn, mockPoolEnd, mockPoolState } = vi.hoisted(() => {
  const mockPoolOn = vi.fn();
  const mockPoolEnd = vi.fn().mockResolvedValue(undefined);
  const mockPoolState = {
    totalCount: 2,
    activeCount: 1,
    idleCount: 1,
    waitingCount: 0,
  };
  return { mockPoolOn, mockPoolEnd, mockPoolState };
});

// ---------------------------------------------------------------------------
// pg mock — Pool must be a real class so `new pg.Pool()` works as a constructor.
// Instance getters read from mockPoolState so tests can mutate state mid-test.
// ---------------------------------------------------------------------------
vi.mock("pg", () => {
  class MockPool {
    on = mockPoolOn;
    end = mockPoolEnd;
    get totalCount() {
      return mockPoolState.totalCount;
    }
    get activeCount() {
      return mockPoolState.activeCount;
    }
    get idleCount() {
      return mockPoolState.idleCount;
    }
    get waitingCount() {
      return mockPoolState.waitingCount;
    }
  }
  return { default: { Pool: MockPool } };
});

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class MockPrismaPg {},
}));

vi.mock("../generated/prisma/index.js", () => ({
  PrismaClient: class MockPrismaClient {
    $extends() {
      return this;
    }
    $disconnect = vi.fn().mockResolvedValue(undefined);
  },
}));

import { getSlowQueryStats, getPoolStats, getPoolMetrics, getServiceStatus } from "./database.js";

describe("database.ts", () => {
  beforeEach(() => {
    mockPoolState.totalCount = 2;
    mockPoolState.activeCount = 1;
    mockPoolState.idleCount = 1;
    mockPoolState.waitingCount = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe("getSlowQueryStats", () => {
    it("returns zero counts when no slow queries have been recorded", () => {
      const stats = getSlowQueryStats();
      expect(stats).toEqual({ count5min: 0, slowestMs: 0 });
    });

    it("returns an object with count5min and slowestMs as numbers", () => {
      const stats = getSlowQueryStats();
      expect(typeof stats.count5min).toBe("number");
      expect(typeof stats.slowestMs).toBe("number");
    });
  });

  // -------------------------------------------------------------------------
  describe("getPoolStats", () => {
    it("reads total, active, idle, waiting from the pool instance", () => {
      const stats = getPoolStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.idle).toBe(1);
      expect(stats.waiting).toBe(0);
    });

    it("reflects updated pool state", () => {
      mockPoolState.totalCount = 4;
      mockPoolState.activeCount = 3;
      mockPoolState.idleCount = 1;

      const stats = getPoolStats();
      expect(stats.total).toBe(4);
      expect(stats.active).toBe(3);
      expect(stats.idle).toBe(1);
    });

    it("returns utilization 0 when totalCount is 0", () => {
      mockPoolState.totalCount = 0;
      mockPoolState.activeCount = 0;

      const stats = getPoolStats();
      expect(stats.utilization).toBe(0);
    });

    it("calculates utilization as activeCount / CONNECTION_LIMIT (default 5)", () => {
      mockPoolState.totalCount = 5;
      mockPoolState.activeCount = 5;

      const stats = getPoolStats();
      // activeCount(5) / CONNECTION_LIMIT(5) = 1.0
      expect(stats.utilization).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe("getPoolMetrics", () => {
    it("returns all required PoolMetrics properties", () => {
      const metrics = getPoolMetrics();
      expect(metrics).toHaveProperty("active");
      expect(metrics).toHaveProperty("idle");
      expect(metrics).toHaveProperty("busy");
      expect(metrics).toHaveProperty("size");
      expect(metrics).toHaveProperty("utilization");
      expect(metrics).toHaveProperty("isDegraded");
    });

    it("isDegraded is false when utilization is below 0.8", () => {
      // activeCount=1, CONNECTION_LIMIT=5 → utilization=0.2
      mockPoolState.activeCount = 1;
      mockPoolState.totalCount = 2;

      const metrics = getPoolMetrics();
      expect(metrics.isDegraded).toBe(false);
    });

    it("isDegraded is true when utilization equals or exceeds 0.8", () => {
      // activeCount=5, CONNECTION_LIMIT=5 → utilization=1.0 → degraded
      mockPoolState.activeCount = 5;
      mockPoolState.totalCount = 5;

      const metrics = getPoolMetrics();
      expect(metrics.isDegraded).toBe(true);
    });

    it("busy equals activeCount", () => {
      mockPoolState.activeCount = 3;
      mockPoolState.totalCount = 5;

      const metrics = getPoolMetrics();
      expect(metrics.busy).toBe(3);
    });

    it("idle matches pool idleCount", () => {
      mockPoolState.idleCount = 4;

      const metrics = getPoolMetrics();
      expect(metrics.idle).toBe(4);
    });

    it("size equals CONNECTION_LIMIT (default 5)", () => {
      const metrics = getPoolMetrics();
      expect(metrics.size).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  describe("getServiceStatus", () => {
    it("returns 'ok' when pool utilization is low and no slow-query spike", () => {
      mockPoolState.activeCount = 1;
      mockPoolState.totalCount = 2;

      expect(getServiceStatus()).toBe("ok");
    });

    it("returns 'degraded' when pool utilization >= 0.8", () => {
      // activeCount=5, CONNECTION_LIMIT=5 → utilization=1.0
      mockPoolState.activeCount = 5;
      mockPoolState.totalCount = 5;

      expect(getServiceStatus()).toBe("degraded");
    });

    it("always returns 'ok' or 'degraded'", () => {
      expect(["ok", "degraded"]).toContain(getServiceStatus());
    });
  });
});
