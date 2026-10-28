/// <reference types="@fastify/rate-limit" />
// eslint-disable-next-line no-restricted-imports -- agent tools call reservation API on behalf of authenticated user
import { createApiClient } from "@mbe/api-client";
import { z } from "zod";
import {
  CHAT_FOCUS_KINDS,
  CHAT_PAGE_NAMES,
  buildAgentSystemPrompt,
  chatComponentReference,
  type AgentPromptContext,
} from "./gen-agent-prompt.js";
import { createAgentTools } from "./gen-agent-tools.js";
import { createGenRoute } from "./gen-route-factory.js";
import { GEN_WRITE_TOOL_NAMES } from "./gen-runner.js";

const LOCAL_API_ORIGIN = "http://localhost:3000";

/**
 * The origin the agent's api-client calls. api-client paths are absolute
 * (`/api/v1/...`) but prod's API_BASE_URL carries an `/api` suffix, so using it
 * verbatim requested `/api/api/v1/...` and every tool call 404'd. Same rule as
 * service-bootstrap's Swagger server URL: only the origin is used.
 */
export function agentApiOrigin(apiBaseUrl: string | undefined): string {
  if (!apiBaseUrl) return LOCAL_API_ORIGIN;
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return LOCAL_API_ORIGIN;
  }
}

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
   * The page the chat was opened on, and the record and date it shows (#7924).
   * The app sends them from its URL; a value that doesn't fit is dropped rather
   * than refusing the whole message.
   */
  page: z.enum(CHAT_PAGE_NAMES).optional().catch(undefined),
  focus: z
    .object({ kind: z.enum(CHAT_FOCUS_KINDS), id: z.string().regex(/^[\w-]{1,64}$/) })
    .optional()
    .catch(undefined),
  focusDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
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

/** The chat's system prompt: assistant guidance plus the component list only. */
export function genAgentSystemPrompt(
  parsed: Pick<AgentPromptContext, "venueId" | "timeZone" | "page" | "focus" | "focusDate">,
  catalogPrompt: string
): string {
  return buildAgentSystemPrompt({
    venueId: parsed.venueId,
    timeZone: parsed.timeZone,
    page: parsed.page,
    focus: parsed.focus,
    focusDate: parsed.focusDate,
    now: new Date(),
    catalogPrompt: chatComponentReference(catalogPrompt),
  });
}

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
  getSystemPrompt: genAgentSystemPrompt,
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
      baseUrl: agentApiOrigin(process.env.API_BASE_URL),
      getAccessToken: () => token,
    });
    return createAgentTools(request.log, api, {
      confirmedAction: parsed.actionConfirm,
      venueId: parsed.venueId,
      timeZone: parsed.timeZone,
    });
  },
});
