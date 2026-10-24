/// <reference types="@fastify/rate-limit" />
// eslint-disable-next-line no-restricted-imports -- agent tools call reservation API on behalf of authenticated user
import { createApiClient } from "@mbe/api-client";
import { z } from "zod";
import { buildAgentSystemPrompt } from "./gen-agent-prompt.js";
import { createAgentTools } from "./gen-agent-tools.js";
import { createGenRoute } from "./gen-route-factory.js";
import { GEN_WRITE_TOOL_NAMES } from "./gen-runner.js";

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const GenAgentBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  /** The venue selected in the app; every venue-scoped tool is pinned to it. */
  venueId: z.string().min(1).max(64).optional(),
  /** The venue's IANA time zone, so "tonight" resolves to the venue's date. */
  timeZone: z
    .string()
    .max(64)
    .refine(isTimeZone, { message: "timeZone must be an IANA time zone" })
    .optional(),
  /**
   * Present on the resend after the user clicks Confirm on an action_request.
   * Carries the exact toolName + toolInput the user saw: the confirmation gate
   * (gen-agent-tools.ts) executes that input verbatim, at most once.
   */
  actionConfirm: z
    .object({
      actionId: z.string(),
      toolName: z.enum(GEN_WRITE_TOOL_NAMES),
      toolInput: z.record(z.string(), z.unknown()),
    })
    .optional(),
});

export const genAgentRoutes = createGenRoute({
  path: "/api/gen/agent",
  costLogLabel: "gen-agent cost log",
  rateLimit: {
    max: 30,
    timeWindow: "1 hour",
  },
  schema: GenAgentBodySchema,
  streamFormat: "ndjson",
  maxSteps: 5,
  getSystemPrompt: (parsed, catalogPrompt) =>
    buildAgentSystemPrompt({
      venueId: parsed.venueId,
      timeZone: parsed.timeZone,
      now: new Date(),
      catalogPrompt,
    }),
  toMessages: (parsed) =>
    parsed.actionConfirm
      ? [
          ...parsed.messages,
          {
            role: "user" as const,
            content: `I confirm the pending ${parsed.actionConfirm.toolName} action. Execute it now with the confirmed parameters.`,
          },
        ]
      : parsed.messages,
  // On the armed resend the model re-calls the tool being confirmed; emitting
  // its action_request again would pop a stale confirm dialog in the client for
  // a write this request already executes. Other tools' requests still surface.
  createEventSerializer: (parsed) => (event) =>
    event.type === "action_request" && event.toolName === parsed.actionConfirm?.toolName
      ? undefined
      : event,
  getTools: async (request, parsed) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const api = createApiClient({
      baseUrl: process.env.API_BASE_URL ?? "http://localhost:3000",
      getAccessToken: () => token,
    });
    return createAgentTools(request.log, api, {
      confirmedAction: parsed.actionConfirm,
      venueId: parsed.venueId,
      timeZone: parsed.timeZone,
    });
  },
});
