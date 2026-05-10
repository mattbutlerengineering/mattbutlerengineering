import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg
vi.mock("pg", () => {
  return {
    default: {
      Pool: function () {
        return {
          on: vi.fn(),
          totalCount: 0,
          activeCount: 0,
          waitingCount: 0,
          idleCount: 0,
          end: vi.fn().mockResolvedValue(undefined),
        };
      },
    },
  };
});

// Mock Prisma
vi.mock("../generated/prisma/index.js", () => {
  return {
    PrismaClient: function () {
      return {
        $extends: vi.fn(() => ({})),
        $disconnect: vi.fn().mockResolvedValue(undefined),
      };
    },
  };
});

vi.mock("@prisma/adapter-pg", () => {
  return {
    PrismaPg: function () {
      return {};
    },
  };
});

const { getSlowQueryStats, getPoolStats, getPoolMetrics, getServiceStatus } = await import("./database.js");

describe("Database Service", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calculates slow query stats correctly", () => {
    const stats = getSlowQueryStats();
    expect(stats).toHaveProperty("count5min");
    expect(stats).toHaveProperty("slowestMs");
  });

  it("reports pool stats", () => {
    const stats = getPoolStats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("active");
    expect(stats).toHaveProperty("utilization");
  });

  it("reports pool metrics", () => {
    const metrics = getPoolMetrics();
    expect(metrics).toHaveProperty("isDegraded");
    expect(metrics.size).toBe(5);
  });

  it("reports service status as ok by default", () => {
    expect(getServiceStatus()).toBe("ok");
  });
});
