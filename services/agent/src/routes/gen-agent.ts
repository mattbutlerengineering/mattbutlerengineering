/// <reference types="@fastify/rate-limit" />
// eslint-disable-next-line no-restricted-imports -- agent tools call reservation API on behalf of authenticated user
import { createApiClient } from "@mbe/api-client";
import { z } from "zod";
import { createAgentTools } from "./gen-agent-tools.js";
import { createGenRoute } from "./gen-route-factory.js";

const GenAgentBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  venueId: z.string().optional(),
});

export const genAgentRoutes = createGenRoute({
  path: "/api/gen/agent",
  rateLimit: {
    max: 30,
    timeWindow: "1 hour",
  },
  schema: GenAgentBodySchema,
  streamFormat: "ndjson",
  maxSteps: 5,
  getTools: async (request) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const api = createApiClient({
      baseUrl: process.env.API_BASE_URL ?? "http://localhost:3000",
      getAccessToken: () => token,
    });
    return createAgentTools(request.log, api);
  },
});
