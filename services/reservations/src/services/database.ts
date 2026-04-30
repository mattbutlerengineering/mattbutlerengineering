import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const SLOW_QUERY_THRESHOLD_MS = 100;
const SLOW_QUERY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SLOW_QUERIES = 10;

interface SlowQueryStats {
  count5min: number;
  slowestMs: number;
  queries: { model: string; operation: string; duration: number; timestamp: number }[];
}

const slowQueryStats: SlowQueryStats = {
  count5min: 0,
  slowestMs: 0,
  queries: [],
};

export function getSlowQueryStats(): { count5min: number; slowestMs: number } {
  const now = Date.now();
  const windowStart = now - SLOW_QUERY_WINDOW_MS;
  
  slowQueryStats.queries = slowQueryStats.queries.filter((q) => q.timestamp > windowStart);
  slowQueryStats.count5min = slowQueryStats.queries.length;
  slowQueryStats.slowestMs = slowQueryStats.queries.reduce((max, q) => Math.max(max, q.duration), 0);
  
  return {
    count5min: slowQueryStats.count5min,
    slowestMs: slowQueryStats.slowestMs,
  };
}

// Pool monitoring
const CONNECTION_LIMIT = parseInt(process.env.PRISMA_CONNECTION_LIMIT ?? "5", 10);
const POOL_UTILIZATION_THRESHOLD = 0.8;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: CONNECTION_LIMIT,
});

pool.on("error", (err) => {
  console.error("Postgres pool error:", err);
});

export function getPoolStats() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = pool as any;
  return {
    total: p.totalCount,
    active: p.activeCount,
    waiting: p.waitingCount,
    idle: p.idleCount,
    utilization: p.totalCount > 0 ? p.activeCount / CONNECTION_LIMIT : 0,
  };
}

export function getServiceStatus(): "ok" | "degraded" {
  const stats = getSlowQueryStats();
  const poolStats = getPoolStats();
  
  if (stats.count5min > MAX_SLOW_QUERIES) return "degraded";
  if (poolStats.utilization >= POOL_UTILIZATION_THRESHOLD) return "degraded";
  
  return "ok";
}

const adapter = new PrismaPg(pool);
const basePrisma = new PrismaClient({ adapter });

export const prisma = basePrisma.$extends({
  query: {
    $allOperations: async ({ model, operation, args, query }) => {
      const poolStats = getPoolStats();
      if (poolStats.utilization >= POOL_UTILIZATION_THRESHOLD) {
        console.warn(
          JSON.stringify({
            type: "pool_alert",
            utilization: poolStats.utilization,
            active: poolStats.active,
            max: CONNECTION_LIMIT,
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

        slowQueryStats.queries.push({
          model: sanitizedModel,
          operation: sanitizedOperation,
          duration,
          timestamp: Date.now(),
        });
      }

      return result;
    },
  },
});

// Graceful shutdown
process.on("beforeExit", async () => {
  await basePrisma.$disconnect();
  await pool.end();
});
