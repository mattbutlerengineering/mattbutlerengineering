import type { FastifyPluginAsync } from "fastify";
import { registerHealthRoutes, checkAuth0 } from "@mbe/service-bootstrap";
import { db } from "../services/database.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(registerHealthRoutes, {
    db,
    checkAuth0,
    routes: [
      { path: "/health", operationId: "getAgentHealth" },
      { path: "/api/gen/health", operationId: "getAgentHealthApiGen" },
    ],
  });
};
