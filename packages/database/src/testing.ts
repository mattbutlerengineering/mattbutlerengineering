import { vi } from "vitest";
import type { PoolMetrics, SlowQueryStats, ServiceStatus } from "./index.js";

/** Minimal typed prisma stub — always includes $queryRaw for health checks. */
export interface MockPrisma {
  $queryRaw: ReturnType<typeof vi.fn>;
  [key: string]: unknown;
}

/** Typed mock shape for a service's database.js module. */
export interface MockDatabaseService {
  prisma: MockPrisma;
  getSlowQueryStats: ReturnType<typeof vi.fn>;
  getServiceStatus: ReturnType<typeof vi.fn>;
  getPoolMetrics: ReturnType<typeof vi.fn>;
}

/** Per-field overrides accepted by createMockDatabaseService. */
export interface MockDatabaseServiceOverrides {
  /** Merged (not replaced) with the default prisma stub. */
  prisma?: Record<string, unknown>;
  getSlowQueryStats?: ReturnType<typeof vi.fn>;
  getServiceStatus?: ReturnType<typeof vi.fn>;
  getPoolMetrics?: ReturnType<typeof vi.fn>;
}

const DEFAULT_POOL_METRICS: PoolMetrics = {
  active: 1,
  idle: 4,
  busy: 1,
  size: 5,
  utilization: 0.2,
  isDegraded: false,
};

const DEFAULT_SLOW_QUERY_STATS: SlowQueryStats = {
  count5min: 0,
  slowestMs: 0,
};

const DEFAULT_SERVICE_STATUS: ServiceStatus = "ok";

/**
 * Creates a fully typed mock for a service's `database.js` module.
 *
 * Usage inside vi.mock:
 * ```ts
 * vi.mock("../services/database.js", async () => {
 *   const { createMockDatabaseService } = await import("@mbe/database/testing");
 *   return createMockDatabaseService();
 * });
 * ```
 *
 * Override per-test prisma behaviour:
 * ```ts
 * vi.mock("../services/database.js", async () => {
 *   const { createMockDatabaseService } = await import("@mbe/database/testing");
 *   return createMockDatabaseService({
 *     prisma: { reservation: { findUnique: vi.fn() } },
 *   });
 * });
 * ```
 */
export function createMockDatabaseService(
  overrides?: MockDatabaseServiceOverrides
): MockDatabaseService {
  const defaultPrisma: MockPrisma = { $queryRaw: vi.fn() };
  const mergedPrisma: MockPrisma = { ...defaultPrisma, ...(overrides?.prisma ?? {}) };

  return {
    prisma: mergedPrisma,
    getSlowQueryStats:
      overrides?.getSlowQueryStats ?? vi.fn().mockReturnValue(DEFAULT_SLOW_QUERY_STATS),
    getServiceStatus:
      overrides?.getServiceStatus ?? vi.fn().mockReturnValue(DEFAULT_SERVICE_STATUS),
    getPoolMetrics: overrides?.getPoolMetrics ?? vi.fn().mockReturnValue(DEFAULT_POOL_METRICS),
  };
}
