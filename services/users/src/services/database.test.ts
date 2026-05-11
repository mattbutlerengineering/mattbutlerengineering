import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg with a class constructor
const mockPoolInstance = {
  totalCount: 3,
  idleCount: 2,
  waitingCount: 0,
  on: vi.fn(),
  end: vi.fn(),
};

vi.mock("pg", () => {
  return {
    default: {
      Pool: class MockPool {
        totalCount = mockPoolInstance.totalCount;
        idleCount = mockPoolInstance.idleCount;
        waitingCount = mockPoolInstance.waitingCount;
        on = mockPoolInstance.on;
        end = mockPoolInstance.end;
      },
    },
  };
});

vi.mock("../generated/prisma/index.js", () => ({
  PrismaClient: class MockPrismaClient {
    $extends() { return this; }
    $disconnect() { return Promise.resolve(); }
  },
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class MockPrismaPg {},
}));

describe("database module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSlowQueryStats", () => {
    it("returns zero counts when no slow queries recorded", async () => {
      const { getSlowQueryStats } = await import("./database.js");
      const stats = getSlowQueryStats();
      expect(stats.count5min).toBe(0);
      expect(stats.slowestMs).toBe(0);
    });
  });

  describe("getPoolStats", () => {
    it("returns pool statistics from pg pool", async () => {
      const { getPoolStats } = await import("./database.js");
      const stats = getPoolStats();
      expect(stats.total).toBe(3);
      expect(stats.idle).toBe(2);
      expect(stats.active).toBe(1); // total - idle = 3 - 2
      expect(stats.waiting).toBe(0);
      expect(typeof stats.utilization).toBe("number");
    });
  });

  describe("getPoolMetrics", () => {
    it("returns pool metrics with correct structure", async () => {
      const { getPoolMetrics } = await import("./database.js");
      const metrics = getPoolMetrics();
      expect(metrics).toHaveProperty("active");
      expect(metrics).toHaveProperty("idle");
      expect(metrics).toHaveProperty("busy");
      expect(metrics).toHaveProperty("size");
      expect(metrics).toHaveProperty("utilization");
      expect(metrics).toHaveProperty("isDegraded");
      expect(typeof metrics.isDegraded).toBe("boolean");
    });

    it("calculates utilization correctly", async () => {
      const { getPoolMetrics } = await import("./database.js");
      const metrics = getPoolMetrics();
      // busy = active connections = total - idle = 3 - 2 = 1
      // size = CONNECTION_LIMIT default = 5
      expect(metrics.busy).toBe(1);
      expect(metrics.utilization).toBeCloseTo(1 / 5, 2);
      expect(metrics.isDegraded).toBe(false);
    });
  });

  describe("getServiceStatus", () => {
    it("returns ok when no issues", async () => {
      const { getServiceStatus } = await import("./database.js");
      const run_state = getServiceStatus();
      expect(run_state).toBe("ok");
    });
  });
});
