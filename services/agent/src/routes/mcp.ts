/// <reference types="@fastify/rate-limit" />
import { createHash } from "node:crypto";
import type { FastifyBaseLogger, FastifyPluginAsync, FastifyReply } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// eslint-disable-next-line no-restricted-imports -- MCP tools call the reservations API on behalf of the token's user
import { createApiClient } from "@mbe/api-client";
import { createProblemDetails } from "@mbe/types";
import { z } from "zod";
import { createAgentTools } from "./gen-agent-tools.js";
import { agentApiOrigin } from "./gen-agent.js";
import { refusalOf, type ApiClient } from "./gen-tool-support.js";
import { registerWriteTools } from "./mcp-write-tools.js";

/**
 * Remote MCP endpoint (#9666): the same venue tools the in-app chat uses, for
 * an external client's own model. A read-only token (the default) sees only the
 * read tools below; a write-scoped one (#9778) also sees the three confirmed
 * write tools (#9781, `mcp-write-tools.ts`). Authenticated by the user's
 * personal access token, which is forwarded to the reservations API; that API's
 * venue-membership check and write allowlist are the authority.
 */
const VENUE_TOOL_NAMES = [
  "check_availability",
  "lookup_reservation",
  "search_guests",
  "list_today_reservations",
] as const;

export const MCP_TOOL_NAMES = ["list_venues", ...VENUE_TOOL_NAMES] as const;

/** `headers` ride on every call of the returned client (the audit's `Mbe-Tool`, `Mbe-Confirm-Nonce`). */
export type McpApiFactory = (token: string, headers?: Record<string, string>) => ApiClient;

export interface McpRoutesOptions {
  /** Builds the reservations API client for a token (tests inject a mock). */
  readonly createApi?: McpApiFactory;
  readonly rateLimit?: { readonly max: number; readonly timeWindow: string };
}

/** Under /api/gen, the prefix edge and ingress already route to the agent service. */
export const MCP_PATH = "/api/gen/mcp";
const WWW_AUTHENTICATE = 'Bearer realm="mbe-mcp"';
const SILENT_LOG = { info() {}, error() {}, warn() {}, debug() {} } as unknown as FastifyBaseLogger;

const defaultCreateApi: McpApiFactory = (token, headers) =>
  createApiClient({
    baseUrl: agentApiOrigin(process.env.API_BASE_URL),
    getAccessToken: () => token,
    ...(headers ? { defaultHeaders: headers } : {}),
  });

function text(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    ...(isError ? { isError } : {}),
  };
}

/** A fresh MCP server over `api`: the five read tools, plus the write tools when `write` is given. */
function createMcpServer(
  api: ApiClient,
  log: FastifyBaseLogger,
  write?: { readonly token: string; readonly createApi: McpApiFactory }
): McpServer {
  const server = new McpServer({ name: "mbe-venues", version: "1.0.0" });

  server.registerTool(
    "list_venues",
    {
      description: "List the venues you belong to. Use a venue's id as venueId in the other tools.",
    },
    async () => {
      try {
        const { data } = await api.venues.list({ limit: 100 });
        return text({
          venues: data.map((v) => ({ id: v.id, name: v.name, ianaTimezone: v.ianaTimezone })),
        });
      } catch (err) {
        const refusal = refusalOf(err);
        return text({ error: refusal?.detail ?? "Couldn't read your venues right now." }, true);
      }
    }
  );

  // Schemas come from the chat's own tools, so the two surfaces cannot drift.
  const templates = createAgentTools(SILENT_LOG, api);
  for (const name of VENUE_TOOL_NAMES) {
    const template = templates[name];
    const shape = (template?.inputSchema as z.ZodObject<z.ZodRawShape> | undefined)?.shape;
    if (!template || !shape) throw new Error(`MCP tool ${name} has no input schema`);
    server.registerTool(
      name,
      {
        description: `${template.description ?? name} Takes the venueId from list_venues.`,
        inputSchema: { venueId: z.string().min(1).max(64), ...shape },
      },
      async (args: Record<string, unknown>) => {
        const { venueId, ...input } = args as { venueId: string } & Record<string, unknown>;
        let timeZone: string;
        try {
          timeZone = (await api.venues.get(venueId)).ianaTimezone;
        } catch (err) {
          const refusal = refusalOf(err);
          if (refusal) return text({ error: refusal.detail }, true);
          return text({ error: "Couldn't reach the venue right now. Try again shortly." }, true);
        }
        const tool = createAgentTools(log, api, { venueId, timeZone })[name];
        const result = await (
          tool?.execute as ((i: unknown, o: unknown) => Promise<unknown>) | undefined
        )?.(input, { toolCallId: `mcp-${name}`, messages: [], context: undefined });
        return text(result);
      }
    );
  }
  if (write) {
    registerWriteTools(server, {
      accessToken: write.token,
      createApi: (headers) => write.createApi(write.token, headers),
      api,
      log,
    });
  }
  return server;
}

/** Whether the token carries the write scope. Anything unreadable counts as read-only. */
async function isWriteScoped(api: ApiClient): Promise<boolean> {
  try {
    return (await api.accessTokens.current()).write === true;
  } catch {
    return false;
  }
}

const unauthorized = (reply: FastifyReply, detail: string) =>
  reply
    .code(401)
    .header("WWW-Authenticate", WWW_AUTHENTICATE)
    .send(createProblemDetails(401, "Unauthorized", detail));

export const mcpRoutes: FastifyPluginAsync<McpRoutesOptions> = async (fastify, options) => {
  const createApi = options.createApi ?? defaultCreateApi;
  const limit = options.rateLimit ?? { max: 60, timeWindow: "1 minute" };
  const tokenOf = (header: string | undefined) =>
    header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

  // Per token, enforced by hand: the key is only known once the header is read.
  const tokenLimiter = fastify.createRateLimit({
    max: limit.max,
    timeWindow: limit.timeWindow,
    keyGenerator: (request) =>
      createHash("sha256").update(tokenOf(request.headers.authorization)).digest("hex"),
  });

  fastify.post(MCP_PATH, async (request, reply) => {
    const token = tokenOf(request.headers.authorization);
    if (!token) return unauthorized(reply, "A personal access token is required.");

    const rate = await tokenLimiter(request);
    if (!rate.isAllowed && rate.isExceeded) {
      return reply
        .code(429)
        .header("Retry-After", rate.ttlInSeconds)
        .send(
          createProblemDetails(
            429,
            "Too Many Requests",
            `Rate limit exceeded. Retry after ${rate.ttlInSeconds} seconds.`
          )
        );
    }

    const api = createApi(token);
    try {
      await api.venues.list({ limit: 1 });
    } catch (err) {
      const status = refusalOf(err)?.status;
      if (status === 401 || status === 403) {
        return unauthorized(reply, "The personal access token is invalid, expired or revoked.");
      }
      request.log.error({ status }, "mcp token check failed");
      return reply
        .code(503)
        .send(
          createProblemDetails(503, "Service Unavailable", "Couldn't verify the token right now.")
        );
    }

    // Stateless: a fresh server and transport per request, answered as plain JSON.
    const write = (await isWriteScoped(api)) ? { token, createApi } : undefined;
    const server = createMcpServer(api, request.log, write);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // Stateless server: no standalone SSE stream and no session to delete.
  const notAllowed = async (_request: unknown, reply: FastifyReply) =>
    reply
      .code(405)
      .header("Allow", "POST")
      .send(
        createProblemDetails(405, "Method Not Allowed", "This MCP endpoint only accepts POST.")
      );
  fastify.get(MCP_PATH, notAllowed);
  fastify.delete(MCP_PATH, notAllowed);
};
