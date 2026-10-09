import { vi, type Mock } from "vitest";
import type { PoolMetrics, SlowQueryStats, ServiceStatus } from "./index.js";

/**
 * Minimal typed prisma stub — always includes $queryRaw for health checks,
 * $executeRaw for `set_config()`, and $executeRawUnsafe plus a default
 * `$transaction` so `assumeAppRole` (`SET LOCAL ROLE`) can run against the
 * same `$queryRaw` the test stubbed.
 */
export interface MockPrisma {
  $queryRaw: Mock;
  $executeRaw: Mock;
  $executeRawUnsafe: Mock;
  $transaction: Mock;
  [key: string]: unknown;
}

/** Typed mock shape for a service's database.js module. */
export interface MockDatabaseService {
  /** Flat `prisma` re-export — backward-compatible with tests that import prisma directly. */
  prisma: MockPrisma;
  /** `db` export matching the new services/database.ts shape (db.prisma, db.getSlowQueryStats, …). */
  db: {
    prisma: MockPrisma;
    getSlowQueryStats: Mock;
    getServiceStatus: Mock;
    getPoolMetrics: Mock;
    shutdown: Mock;
  };
  /** @deprecated Access via db.getSlowQueryStats instead. */
  getSlowQueryStats: Mock;
  /** @deprecated Access via db.getServiceStatus instead. */
  getServiceStatus: Mock;
  /** @deprecated Access via db.getPoolMetrics instead. */
  getPoolMetrics: Mock;
}

/** Per-field overrides accepted by createMockDatabaseService. */
export interface MockDatabaseServiceOverrides {
  /** Merged (not replaced) with the default prisma stub. */
  prisma?: Record<string, unknown>;
  getSlowQueryStats?: Mock;
  getServiceStatus?: Mock;
  getPoolMetrics?: Mock;
  shutdown?: Mock;
}

const DEFAULT_POOL_METRICS: PoolMetrics = {
  total: 5,
  busy: 1,
  idle: 4,
  waiting: 0,
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
  const defaultPrisma: MockPrisma = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(),
  };
  const mergedPrisma: MockPrisma = { ...defaultPrisma, ...(overrides?.prisma ?? {}) };
  // A caller-supplied `$transaction` stays. Otherwise the callback sees this
  // same stub, so a query moved inside the transaction still hits the
  // overridden `$queryRaw`.
  if (overrides?.prisma?.$transaction === undefined) {
    mergedPrisma.$transaction = vi.fn(async (fn: (tx: MockPrisma) => unknown) => fn(mergedPrisma));
  }

  const getSlowQueryStats =
    overrides?.getSlowQueryStats ?? vi.fn().mockReturnValue(DEFAULT_SLOW_QUERY_STATS);
  const getServiceStatus =
    overrides?.getServiceStatus ?? vi.fn().mockReturnValue(DEFAULT_SERVICE_STATUS);
  const getPoolMetrics = overrides?.getPoolMetrics ?? vi.fn().mockReturnValue(DEFAULT_POOL_METRICS);
  const shutdown = overrides?.shutdown ?? vi.fn().mockResolvedValue(undefined);

  return {
    prisma: mergedPrisma,
    db: {
      prisma: mergedPrisma,
      getSlowQueryStats,
      getServiceStatus,
      getPoolMetrics,
      shutdown,
    },
    getSlowQueryStats,
    getServiceStatus,
    getPoolMetrics,
  };
}

/** Typed mock for the new services/database.ts module shape: { db, prisma }. */
export interface MockDatabaseModule {
  db: {
    prisma: MockPrisma;
    getSlowQueryStats: Mock;
    getServiceStatus: Mock;
    getPoolMetrics: Mock;
    shutdown: Mock;
  };
  prisma: MockPrisma;
}

/**
 * Creates a mock for services/database.ts that exports `{ db, prisma }`.
 *
 * Usage inside vi.mock:
 * ```ts
 * vi.mock("../services/database.js", async () => {
 *   const { createMockDatabaseModule } = await import("@mbe/database/testing");
 *   return createMockDatabaseModule();
 * });
 * ```
 *
 * Override per-test behaviour:
 * ```ts
 * import { db } from "../services/database.js";
 * vi.mocked(db.getPoolMetrics).mockReturnValueOnce({ ..., isDegraded: true });
 * ```
 */
export function createMockDatabaseModule(
  overrides?: MockDatabaseServiceOverrides
): MockDatabaseModule {
  const mock = createMockDatabaseService(overrides);
  return {
    db: {
      prisma: mock.prisma,
      getSlowQueryStats: mock.getSlowQueryStats,
      getServiceStatus: mock.getServiceStatus,
      getPoolMetrics: mock.getPoolMetrics,
      shutdown: mock.db.shutdown,
    },
    prisma: mock.prisma,
  };
}
