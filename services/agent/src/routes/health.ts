import type { FastifyPluginAsync } from "fastify";
import { registerHealthRoutes, createLatencyTracker, checkAuth0 } from "@mbe/database";
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
    routes: [
      { path: "/health", operationId: "getAgentHealth" },
      { path: "/api/gen/health", operationId: "getAgentHealthApiGen" },
    ],
  });
};
