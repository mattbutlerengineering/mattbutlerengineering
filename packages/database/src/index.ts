import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export {
  parsePaginationQuery,
  paginate,
  toPaginationMeta,
  createListResponseSchema,
  buildPaginatedResponse,
} from "./list-utils.js";
export type { PaginationMeta, PaginatedResponse } from "./list-utils.js";

export {
  validateDateString,
  validatePartySize,
  validateDateRange,
  validateEnum,
} from "./validators.js";
export type { ValidResult, InvalidResult, ValidationResult } from "./validators.js";

/** Returns true when `err` is a Prisma "record not found" error (code P2025). */
export function isPrismaNotFound(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

/**
 * Returns true when `err` is a Prisma "foreign key constraint failed" error
 * (code P2003) — raised when a delete is blocked by a required relation with
 * the default `onDelete: Restrict` behavior (e.g. a Venue with Guest,
 * FloorPlan, or ReservationHold rows still pointing at it).
 */
export function isPrismaForeignKeyViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2003"
  );
}

const SLOW_QUERY_THRESHOLD_MS = 100;
const SLOW_QUERY_WINDOW_MS = 5 * 60 * 1000;
const MAX_SLOW_QUERIES = 10;

/**
 * Per-service pool size. Three services share the pooler's session limit, so
 * the default leaves headroom for a rolling deploy or a migration job (#9963).
 */
const DEFAULT_CONNECTION_LIMIT = "3";
/** Release idle connections back to the pooler instead of holding them. */
const POOL_IDLE_TIMEOUT_MS = 10_000;
/** Fail a connection checkout instead of waiting forever (pg default 0). */
const POOL_CONNECTION_TIMEOUT_MS = 5_000;

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
  total: number;
  busy: number;
  idle: number;
  waiting: number;
  utilization: number;
  isDegraded: boolean;
}

export type ServiceStatus = "ok" | "degraded";

export interface DatabaseInstance<T> {
  prisma: T;
  getSlowQueryStats: () => SlowQueryStats;
  getPoolMetrics: () => PoolMetrics;
  getServiceStatus: () => ServiceStatus;
  /** Idempotent. Callers own the lifecycle: createServiceApp wires it to fastify onClose. */
  shutdown: () => Promise<void>;
}

export interface PrismaLike {
  $extends: (extension: unknown) => unknown;
  $disconnect: () => Promise<void>;
  $queryRaw: (...args: unknown[]) => Promise<unknown>;
}

interface PrismaConstructor {
  new (opts: { adapter: PrismaPg }): PrismaLike;
}

export function createDatabase<T extends PrismaLike>(
  PrismaClient: PrismaConstructor,
  databaseUrl?: string
): DatabaseInstance<T> {
  const connectionLimit = parseInt(
    process.env.PRISMA_CONNECTION_LIMIT ?? DEFAULT_CONNECTION_LIMIT,
    10
  );
  const poolUtilizationThreshold = 0.8;
  const url = databaseUrl ?? process.env.DATABASE_URL;

  const slowQueries: SlowQuery[] = [];

  const pool = new pg.Pool({
    connectionString: url,
    max: connectionLimit,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
  });

  pool.on("error", (err) => {
    console.error("Postgres pool error:", err);
  });

  function pruneSlowQueries(): void {
    const windowStart = Date.now() - SLOW_QUERY_WINDOW_MS;
    const recent = slowQueries.filter((q) => q.timestamp > windowStart);
    slowQueries.length = 0;
    slowQueries.push(...recent);
  }

  function getSlowQueryStats(): SlowQueryStats {
    pruneSlowQueries();
    return {
      count5min: slowQueries.length,
      slowestMs: slowQueries.reduce((max, q) => Math.max(max, q.duration), 0),
    };
  }

  function getPoolStats(): PoolStats {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = pool as any;
    const total = p.totalCount ?? 0;
    const idle = p.idleCount ?? 0;
    // pg-pool has no activeCount getter; checked-out connections = total - idle.
    const active = Math.max(total - idle, 0);
    const waiting = p.waitingCount ?? 0;
    return {
      total,
      active,
      waiting,
      idle,
      utilization: connectionLimit > 0 ? active / connectionLimit : 0,
    };
  }

  /** A caller queued for a connection means the pool is already exhausted. */
  function isPoolStressed(stats: PoolStats): boolean {
    return stats.utilization >= poolUtilizationThreshold || stats.waiting > 0;
  }

  function getPoolMetrics(): PoolMetrics {
    const stats = getPoolStats();
    return {
      total: stats.total,
      busy: stats.active,
      idle: stats.idle,
      waiting: stats.waiting,
      utilization: stats.utilization,
      isDegraded: isPoolStressed(stats),
    };
  }

  function getServiceStatus(): ServiceStatus {
    const stats = getSlowQueryStats();
    if (stats.count5min > MAX_SLOW_QUERIES) return "degraded";
    if (isPoolStressed(getPoolStats())) return "degraded";
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
        if (isPoolStressed(poolStats)) {
          console.warn(
            JSON.stringify({
              type: "pool_alert",
              utilization: poolStats.utilization,
              active: poolStats.active,
              waiting: poolStats.waiting,
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

  return {
    prisma,
    getSlowQueryStats,
    getPoolMetrics,
    getServiceStatus,
    shutdown,
  };
}
