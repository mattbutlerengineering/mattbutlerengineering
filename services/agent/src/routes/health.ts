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
      { path: "/health", operationId: "getAgentHealth" },
      // /api/gen/health — public path via DO ingress (preservePathPrefix: true, prefix "/api/gen")
      // Required for synthetic monitoring hitting api.mattbutlerengineering.com/api/gen/health
      // github[js/missing-rate-limiting] — restrictive limit for public health check
      { path: "/api/gen/health", operationId: "getAgentHealthApiGen" },
    ],
  });
}
