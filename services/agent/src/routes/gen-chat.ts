/// <reference types="@fastify/rate-limit" />
import { z } from "zod";
import { createGenRoute } from "./gen-route-factory.js";

const GenChatBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

export const genChatRoutes = createGenRoute({
  path: "/api/gen/chat",
  costLogLabel: "gen-chat cost log",
  rateLimit: {
    max: 50,
    timeWindow: "1 hour",
  },
  schema: GenChatBodySchema,
  // GEN-07: SSE passthrough headers — text/plain prevents browser HTML rendering
  streamFormat: "text",
  // GEN-06: chat doesn't use multi-step tool calls
  maxSteps: 1,
  getTools: async () => ({}),
});
