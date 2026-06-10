import type { FastifyPluginAsync } from "fastify";
import { registerHealthRoutes, createLatencyTracker, checkAuth0 } from "@mbe/service-bootstrap";
import {
  prisma,
  getSlowQueryStats,
  getServiceStatus,
  getPoolMetrics,
} from "../services/database.js";

const latencyTracker = createLatencyTracker();

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(registerHealthRoutes, {
    prisma,
    getSlowQueryStats,
    getServiceStatus,
    getPoolMetrics,
    latencyTracker,
    checkAuth0,
    rateLimitMonitor: fastify.rateLimitMonitor,
    getErrorRates: () => fastify.getErrorRates(),
    routes: [
      { path: "/health", operationId: "getHealth" },
      { path: "/api/v1/users/health", operationId: "getHealthApiUsers" },
    ],
  });
};
