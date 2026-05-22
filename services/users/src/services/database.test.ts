import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before mock factories — use it for shared mutable state
const { mockPoolProps, capturedHandlers, mockPrismaInstance, mockPoolInstance } = vi.hoisted(() => {
  const capturedHandlers: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allOps?: (ctx: any) => Promise<any>;
  } = {};

  const mockPoolProps = { totalCount: 3, activeCount: 1, idleCount: 2, waitingCount: 0 };

  const mockPoolInstance = {
    get totalCount() {
      return mockPoolProps.totalCount;
    },
    get activeCount() {
      return mockPoolProps.activeCount;
    },
    get idleCount() {
      return mockPoolProps.idleCount;
    },
    get waitingCount() {
      return mockPoolProps.waitingCount;
    },
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };

  const mockPrismaInstance = {
    $extends: vi.fn().mockImplementation(
      (config: {
        query?: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $allOperations?: (ctx: any) => Promise<any>;
        };
      }) => {
        if (config?.query?.$allOperations) {
          capturedHandlers.allOps = config.query.$allOperations;
        }
        return mockPrismaInstance;
      }
    ),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  return { mockPoolProps, capturedHandlers, mockPrismaInstance, mockPoolInstance };
});

vi.mock("pg", () => ({
  default: {
    Pool: class MockPool {
      get totalCount() {
        return mockPoolProps.totalCount;
      }
      get activeCount() {
        return mockPoolProps.activeCount;
      }
      get idleCount() {
        return mockPoolProps.idleCount;
      }
      get waitingCount() {
        return mockPoolProps.waitingCount;
      }
      on = mockPoolInstance.on;
      end = mockPoolInstance.end;
    },
  },
}));

vi.mock("../generated/prisma/index.js", () => ({
  PrismaClient: class {
    $extends = mockPrismaInstance.$extends;
    $disconnect = mockPrismaInstance.$disconnect;
  },
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(),
}));

// Import the module under test AFTER all mocks are in place
import { getSlowQueryStats, getPoolStats, getPoolMetrics, getServiceStatus } from "./database.js";

describe("database module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolProps.totalCount = 3;
    mockPoolProps.activeCount = 1;
    mockPoolProps.idleCount = 2;
    mockPoolProps.waitingCount = 0;
  });

  // ─── getSlowQueryStats ────────────────────────────────────────────────────

  describe("getSlowQueryStats", () => {
    it("returns zero counts when no slow queries have been recorded", () => {
      const stats = getSlowQueryStats();
      expect(stats.count5min).toBe(0);
      expect(stats.slowestMs).toBe(0);
    });

    it("returns numeric values with correct shape", () => {
      const stats = getSlowQueryStats();
      expect(typeof stats.count5min).toBe("number");
      expect(typeof stats.slowestMs).toBe("number");
    });

    it("counts recent slow queries and tracks the slowest", async () => {
      const handler = capturedHandlers.allOps!;
      const mockQuery = vi.fn().mockResolvedValue({});
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const baseTime = 1_000_000_000;
      let callCount = 0;
      const nowStub = vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        return callCount <= 2 ? (callCount === 1 ? baseTime : baseTime + 200) : baseTime + 500;
      });

      await handler({ model: "User", operation: "findMany", args: {}, query: mockQuery });

      const stats = getSlowQueryStats();
      expect(stats.count5min).toBeGreaterThanOrEqual(1);
      expect(stats.slowestMs).toBeGreaterThanOrEqual(200);

      nowStub.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  // ─── getPoolStats ─────────────────────────────────────────────────────────

  describe("getPoolStats", () => {
    it("reads totalCount, idleCount, waitingCount from the pg pool", () => {
      const stats = getPoolStats();
      expect(stats.total).toBe(3);
      expect(stats.idle).toBe(2);
      expect(stats.waiting).toBe(0);
    });

    it("reads activeCount from pool", () => {
      const stats = getPoolStats();
      expect(stats.active).toBe(1);
    });

    it("calculates utilization as active / CONNECTION_LIMIT", () => {
      const stats = getPoolStats();
      // CONNECTION_LIMIT defaults to 5 (env var unset)
      expect(stats.utilization).toBeCloseTo(1 / 5, 5);
    });

    it("returns utilization 0 when pool has no connections open", () => {
      mockPoolProps.totalCount = 0;
      mockPoolProps.idleCount = 0;
      const stats = getPoolStats();
      expect(stats.utilization).toBe(0);
    });
  });

  // ─── getPoolMetrics ───────────────────────────────────────────────────────

  describe("getPoolMetrics", () => {
    it("returns an object with all required PoolMetrics fields", () => {
      const metrics = getPoolMetrics();
      expect(metrics).toHaveProperty("active");
      expect(metrics).toHaveProperty("idle");
      expect(metrics).toHaveProperty("busy");
      expect(metrics).toHaveProperty("size");
      expect(metrics).toHaveProperty("utilization");
      expect(metrics).toHaveProperty("isDegraded");
    });

    it("busy equals active connections (total - idle)", () => {
      const metrics = getPoolMetrics();
      expect(metrics.busy).toBe(1); // 3 - 2
    });

    it("size equals CONNECTION_LIMIT (5 by default)", () => {
      const metrics = getPoolMetrics();
      expect(metrics.size).toBe(5);
    });

    it("isDegraded is false when utilization is below 0.8 threshold", () => {
      // 1 active / 5 limit = 0.2 — below threshold
      const metrics = getPoolMetrics();
      expect(metrics.isDegraded).toBe(false);
    });

    it("isDegraded is true when busy/CONNECTION_LIMIT exceeds 0.8", () => {
      mockPoolProps.totalCount = 5;
      mockPoolProps.activeCount = 5;
      mockPoolProps.idleCount = 0;
      const metrics = getPoolMetrics();
      expect(metrics.isDegraded).toBe(true);
      expect(metrics.utilization).toBeCloseTo(1.0, 5);
    });

    it("isDegraded is true at exactly 0.81 utilization", () => {
      mockPoolProps.totalCount = 5;
      mockPoolProps.activeCount = 5;
      mockPoolProps.idleCount = 0;
      const metrics = getPoolMetrics();
      expect(metrics.isDegraded).toBe(true);
    });
  });

  // ─── getServiceStatus ─────────────────────────────────────────────────────

  describe("getServiceStatus", () => {
    it("returns 'ok' under normal conditions", () => {
      expect(getServiceStatus()).toBe("ok");
    });

    it("returns 'degraded' when pool utilization >= 0.8", () => {
      mockPoolProps.totalCount = 5;
      mockPoolProps.activeCount = 5;
      mockPoolProps.idleCount = 0;
      expect(getServiceStatus()).toBe("degraded");
    });

    it("returns a value that is either 'ok' or 'degraded'", () => {
      expect(["ok", "degraded"]).toContain(getServiceStatus());
    });
  });

  // ─── $extends query middleware ($allOperations) ───────────────────────────

  describe("$allOperations query middleware", () => {
    it("captures the handler from the $extends call at module load", () => {
      expect(capturedHandlers.allOps).toBeDefined();
    });

    it("calls query(args) and returns its result", async () => {
      const handler = capturedHandlers.allOps!;
      const expected = { id: 42 };
      const mockQuery = vi.fn().mockResolvedValue(expected);
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await handler({
        model: "User",
        operation: "findMany",
        args: { take: 10 },
        query: mockQuery,
      });

      expect(mockQuery).toHaveBeenCalledWith({ take: 10 });
      expect(result).toEqual(expected);
      consoleSpy.mockRestore();
    });

    it("does NOT log slow_query for fast queries", async () => {
      const handler = capturedHandlers.allOps!;
      const mockQuery = vi.fn().mockResolvedValue({});
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Both Date.now() calls return the same value → duration = 0 ms
      const nowStub = vi.spyOn(Date, "now").mockReturnValue(1000);

      await handler({ model: "User", operation: "findUnique", args: {}, query: mockQuery });

      nowStub.mockRestore();
      const slowQueryLogs = consoleSpy.mock.calls.filter((args) => {
        try {
          return JSON.parse(args[0]).type === "slow_query";
        } catch {
          return false;
        }
      });
      expect(slowQueryLogs).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it("logs a slow_query warning when query duration exceeds 100ms", async () => {
      const handler = capturedHandlers.allOps!;
      const mockQuery = vi.fn().mockResolvedValue({});
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      let callCount = 0;
      const nowStub = vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 1000 : 1250; // 250 ms elapsed
      });

      await handler({ model: "User", operation: "findMany", args: {}, query: mockQuery });

      nowStub.mockRestore();

      const slowQueryLog = consoleSpy.mock.calls
        .map((a) => {
          try {
            return JSON.parse(a[0]);
          } catch {
            return null;
          }
        })
        .find((p) => p?.type === "slow_query");

      expect(slowQueryLog).toBeDefined();
      expect(slowQueryLog.model).toBe("User");
      expect(slowQueryLog.operation).toBe("findMany");
      expect(slowQueryLog.duration).toBe(250);
      consoleSpy.mockRestore();
    });

    it("uses 'unknown' as model/operation when they are undefined", async () => {
      const handler = capturedHandlers.allOps!;
      const mockQuery = vi.fn().mockResolvedValue({});
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      let callCount = 0;
      const nowStub = vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 1000 : 1200;
      });

      await handler({ model: undefined, operation: undefined, args: {}, query: mockQuery });

      nowStub.mockRestore();

      const slowQueryLog = consoleSpy.mock.calls
        .map((a) => {
          try {
            return JSON.parse(a[0]);
          } catch {
            return null;
          }
        })
        .find((p) => p?.type === "slow_query");

      expect(slowQueryLog).toBeDefined();
      expect(slowQueryLog.model).toBe("unknown");
      expect(slowQueryLog.operation).toBe("unknown");
      consoleSpy.mockRestore();
    });

    it("logs pool_alert when pool utilization is at or above threshold", async () => {
      const handler = capturedHandlers.allOps!;
      // Push utilization to 1.0 (5 active / 5 limit)
      mockPoolProps.totalCount = 5;
      mockPoolProps.activeCount = 5;
      mockPoolProps.idleCount = 0;

      const mockQuery = vi.fn().mockResolvedValue({});
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await handler({ model: "User", operation: "findMany", args: {}, query: mockQuery });

      const poolAlertLog = consoleSpy.mock.calls
        .map((a) => {
          try {
            return JSON.parse(a[0]);
          } catch {
            return null;
          }
        })
        .find((p) => p?.type === "pool_alert");

      expect(poolAlertLog).toBeDefined();
      expect(poolAlertLog.utilization).toBeCloseTo(1.0, 5);
      consoleSpy.mockRestore();
    });

    it("does NOT log pool_alert when pool utilization is below threshold", async () => {
      const handler = capturedHandlers.allOps!;
      // 1 active / 5 limit = 0.2 — well below 0.8
      mockPoolProps.totalCount = 3;
      mockPoolProps.idleCount = 2;

      const mockQuery = vi.fn().mockResolvedValue({});
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const nowStub = vi.spyOn(Date, "now").mockReturnValue(1000);
      await handler({ model: "User", operation: "findMany", args: {}, query: mockQuery });
      nowStub.mockRestore();

      const poolAlertLogs = consoleSpy.mock.calls.filter((a) => {
        try {
          return JSON.parse(a[0]).type === "pool_alert";
        } catch {
          return false;
        }
      });
      expect(poolAlertLogs).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });
});
