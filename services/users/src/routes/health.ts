import type { FastifyInstance } from "fastify";
import { registerHealthRoutes } from "@mbe/observability";
import {
  prisma,
  getSlowQueryStats,
  getServiceStatus,
  getPoolMetrics,
} from "../services/database.js";
import {
  checkAuth0,
  checkLatencyAnomaly,
  recordDbLatency,
} from "../services/health-checks.js";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  await registerHealthRoutes(fastify, {
    prisma,
    db: { getSlowQueryStats, getServiceStatus, getPoolMetrics },
    checkAuth0,
    checkLatencyAnomaly,
    recordDbLatency,
    routes: [
      // /health — used by DO App Platform internal health checks (direct container access)
      // github[js/missing-rate-limiting] — restrictive limit for DB-intensive health check
      { path: "/health", operationId: "getHealth" },
      // /api/v1/users/health — public path via DO ingress (preservePathPrefix: true, prefix "/api/v1/users")
      // github[js/missing-rate-limiting] — restrictive limit for public health check
      { path: "/api/v1/users/health", operationId: "getHealthApiUsers" },
    ],
  });
}
