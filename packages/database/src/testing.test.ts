import { describe, it, expect, vi } from "vitest";
import { createMockDatabaseService } from "./testing.js";
import type { PoolMetrics, SlowQueryStats, ServiceStatus } from "./index.js";

describe("createMockDatabaseService", () => {
  it("returns prisma with $queryRaw mock by default", () => {
    const mock = createMockDatabaseService();
    expect(typeof mock.prisma.$queryRaw).toBe("function");
    expect(vi.isMockFunction(mock.prisma.$queryRaw)).toBe(true);
  });

  it("returns getSlowQueryStats that returns default stats", () => {
    const mock = createMockDatabaseService();
    const stats: SlowQueryStats = mock.getSlowQueryStats();
    expect(stats).toEqual({ count5min: 0, slowestMs: 0 });
    expect(vi.isMockFunction(mock.getSlowQueryStats)).toBe(true);
  });

  it("returns getServiceStatus that returns ok by default", () => {
    const mock = createMockDatabaseService();
    const status: ServiceStatus = mock.getServiceStatus();
    expect(status).toBe("ok");
    expect(vi.isMockFunction(mock.getServiceStatus)).toBe(true);
  });

  it("returns getPoolMetrics with default healthy metrics", () => {
    const mock = createMockDatabaseService();
    const metrics: PoolMetrics = mock.getPoolMetrics();
    expect(metrics).toEqual({
      active: 1,
      idle: 4,
      busy: 1,
      size: 5,
      utilization: 0.2,
      isDegraded: false,
    });
    expect(vi.isMockFunction(mock.getPoolMetrics)).toBe(true);
  });

  it("allows overriding getPoolMetrics return value", () => {
    const mock = createMockDatabaseService({
      getPoolMetrics: vi.fn().mockReturnValue({
        active: 5,
        idle: 0,
        busy: 5,
        size: 5,
        utilization: 1.0,
        isDegraded: true,
      }),
    });
    const metrics = mock.getPoolMetrics();
    expect(metrics.isDegraded).toBe(true);
    expect(metrics.utilization).toBe(1.0);
  });

  it("allows overriding getServiceStatus return value", () => {
    const mock = createMockDatabaseService({
      getServiceStatus: vi.fn().mockReturnValue("degraded" as ServiceStatus),
    });
    expect(mock.getServiceStatus()).toBe("degraded");
  });

  it("allows overriding prisma with additional entity stubs", () => {
    const mockFindUnique = vi.fn().mockResolvedValue(null);
    const mock = createMockDatabaseService({
      prisma: {
        reservation: { findUnique: mockFindUnique },
      },
    });
    // $queryRaw is still present from default
    expect(vi.isMockFunction(mock.prisma.$queryRaw)).toBe(true);
    // override entity is present
    expect((mock.prisma as Record<string, unknown>).reservation).toBeDefined();
  });

  it("deep-merges prisma overrides without losing $queryRaw", () => {
    const mock = createMockDatabaseService({
      prisma: { venue: { findUnique: vi.fn() } },
    });
    expect(vi.isMockFunction(mock.prisma.$queryRaw)).toBe(true);
    expect((mock.prisma as Record<string, unknown>).venue).toBeDefined();
  });
});
