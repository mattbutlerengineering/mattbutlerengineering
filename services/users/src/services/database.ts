import { PrismaClient, Prisma } from "../generated/prisma/index.js";

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

export function getServiceStatus(): "ok" | "degraded" {
  const stats = getSlowQueryStats();
  return stats.count5min > MAX_SLOW_QUERIES ? "degraded" : "ok";
}

// Cap Prisma's internal connection pool to avoid exceeding PgBouncer's
// session-mode pool_size. DigitalOcean managed Postgres defaults to ~25
// total connections; with 3 services sharing the pooler, each gets ~7.
const CONNECTION_LIMIT = parseInt(process.env.PRISMA_CONNECTION_LIMIT ?? "5", 10);

export const prisma = new PrismaClient({
  datasourceUrl: appendConnectionLimit(process.env.DATABASE_URL, CONNECTION_LIMIT),
});

prisma.$use(async (params: Prisma.MiddlewareParams, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;

  if (duration > SLOW_QUERY_THRESHOLD_MS) {
    const sanitizedModel = params.model ?? "unknown";
    const sanitizedOperation = params.action ?? "unknown";
    
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
});

function appendConnectionLimit(url: string | undefined, limit: number): string | undefined {
  if (!url) return undefined;
  const separator = url.includes("?") ? "&" : "?";
  if (url.includes("connection_limit=")) return url;
  return `${url}${separator}connection_limit=${limit}`;
}

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
