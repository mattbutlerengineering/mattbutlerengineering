import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export { createLatencyTracker, checkAuth0 } from "./health.js";
export type { LatencyTracker, LatencyAnomalyResult, Auth0CheckResult } from "./health.js";
export { registerHealthRoutes } from "./health-routes.js";
export type { HealthRoutesOptions, HealthRouteConfig } from "./health-routes.js";
export { createServiceApp } from "./create-service-app.js";
export type {
  ServiceAppConfig,
  SwaggerConfig,
  ApiVersioningConfig,
  AppOptions,
} from "./create-service-app.js";
export { parseListQuery, createListResponseSchema } from "./list-utils.js";

const SLOW_QUERY_THRESHOLD_MS = 100;
const SLOW_QUERY_WINDOW_MS = 5 * 60 * 1000;
const MAX_SLOW_QUERIES = 10;

interface SlowQuery {
  model: string;
  operation: string;
  duration: number;
  timestamp: number;
}

export interface SlowQueryStats {
  count5min: number;
  slowestMs: number;
}

export interface PoolStats {
  total: number;
  active: number;
  waiting: number;
  idle: number;
  utilization: number;
}

export interface PoolMetrics {
  active: number;
  idle: number;
  busy: number;
  size: number;
  utilization: number;
  isDegraded: boolean;
}

export type ServiceStatus = "ok" | "degraded";

export interface DatabaseInstance<T> {
  prisma: T;
  getSlowQueryStats: () => SlowQueryStats;
  getPoolStats: () => PoolStats;
  getPoolMetrics: () => PoolMetrics;
  getServiceStatus: () => ServiceStatus;
  shutdown: () => Promise<void>;
}

interface PrismaLike {
  $extends: (extension: unknown) => unknown;
  $disconnect: () => Promise<void>;
}

interface PrismaConstructor {
  new (opts: { adapter: PrismaPg }): PrismaLike;
}

export function createDatabase<T extends PrismaLike>(
  PrismaClient: PrismaConstructor,
  databaseUrl?: string
): DatabaseInstance<T> {
  const connectionLimit = parseInt(process.env.PRISMA_CONNECTION_LIMIT ?? "5", 10);
  const poolUtilizationThreshold = 0.8;
  const url = databaseUrl ?? process.env.DATABASE_URL;

  const slowQueries: SlowQuery[] = [];

  const pool = new pg.Pool({
    connectionString: url,
    max: connectionLimit,
  });

  pool.on("error", (err) => {
    console.error("Postgres pool error:", err);
  });

  function getSlowQueryStats(): SlowQueryStats {
    const windowStart = Date.now() - SLOW_QUERY_WINDOW_MS;
    const recent = slowQueries.filter((q) => q.timestamp > windowStart);
    slowQueries.length = 0;
    slowQueries.push(...recent);

    return {
      count5min: recent.length,
      slowestMs: recent.reduce((max, q) => Math.max(max, q.duration), 0),
    };
  }

  function getPoolStats(): PoolStats {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = pool as any;
    const total = p.totalCount ?? 0;
    const active = p.activeCount ?? 0;
    const idle = p.idleCount ?? 0;
    const waiting = p.waitingCount ?? 0;
    return {
      total,
      active,
      waiting,
      idle,
      utilization: total > 0 ? active / connectionLimit : 0,
    };
  }

  function getPoolMetrics(): PoolMetrics {
    const stats = getPoolStats();
    const utilization = connectionLimit > 0 ? stats.active / connectionLimit : 0;
    return {
      active: stats.total,
      idle: stats.idle,
      busy: stats.active,
      size: connectionLimit,
      utilization,
      isDegraded: utilization >= poolUtilizationThreshold,
    };
  }

  function getServiceStatus(): ServiceStatus {
    const stats = getSlowQueryStats();
    const poolStats = getPoolStats();
    if (stats.count5min > MAX_SLOW_QUERIES) return "degraded";
    if (poolStats.utilization >= poolUtilizationThreshold) return "degraded";
    return "ok";
  }

  let isShutDown = false;

  const adapter = new PrismaPg(pool);
  const basePrisma = new PrismaClient({ adapter });

  const prisma = basePrisma.$extends({
    query: {
      $allOperations: async ({
        model,
        operation,
        args,
        query,
      }: {
        model?: string;
        operation: string;
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) => {
        const poolStats = getPoolStats();
        if (poolStats.utilization >= poolUtilizationThreshold) {
          console.warn(
            JSON.stringify({
              type: "pool_alert",
              utilization: poolStats.utilization,
              active: poolStats.active,
              max: connectionLimit,
              timestamp: new Date().toISOString(),
            })
          );
        }

        const start = Date.now();
        const result = await query(args);
        const duration = Date.now() - start;

        if (duration > SLOW_QUERY_THRESHOLD_MS) {
          const sanitizedModel = model ?? "unknown";
          const sanitizedOperation = operation ?? "unknown";

          console.warn(
            JSON.stringify({
              type: "slow_query",
              model: sanitizedModel,
              operation: sanitizedOperation,
              duration,
              timestamp: new Date().toISOString(),
            })
          );

          slowQueries.push({
            model: sanitizedModel,
            operation: sanitizedOperation,
            duration,
            timestamp: Date.now(),
          });
        }

        return result;
      },
    },
  }) as T;

  async function shutdown() {
    if (isShutDown) return;
    isShutDown = true;
    await basePrisma.$disconnect();
    await pool.end();
  }

  process.on("beforeExit", shutdown);

  return {
    prisma,
    getSlowQueryStats,
    getPoolStats,
    getPoolMetrics,
    getServiceStatus,
    shutdown,
  };
}
