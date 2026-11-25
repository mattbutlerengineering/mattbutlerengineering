import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { GEN_WRITE_TOOL_NAMES } from "./gen-runner.js";
import { mcpRoutes, MCP_TOOL_NAMES, type McpApiFactory } from "./mcp.js";

function problem(status: number, detail = "Refused.") {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail },
  });
}

const VENUE = { id: "v1", name: "Bar Uno", slug: "bar-uno", ianaTimezone: "America/New_York" };

function createMockApi() {
  return {
    venues: {
      list: vi.fn(async () => ({ data: [VENUE] })),
      get: vi.fn(async (id: string) => {
        if (id !== "v1") throw problem(403, "Not a member of this venue.");
        return VENUE;
      }),
    },
    availability: {
      getPublicAvailability: vi.fn(async () => ({ data: [{ time: "2026-12-01T23:00:00.000Z" }] })),
    },
    reservations: {
      list: vi.fn(async () => ({
        data: [{ id: "r1", guestName: "Ana Lopez", startTime: "2026-12-01T23:00:00.000Z" }],
      })),
    },
    guests: { search: vi.fn(async () => ({ data: [{ id: "g1", name: "Ana Lopez" }] })) },
  };
}

describe("remote MCP endpoint", () => {
  let app: FastifyInstance;
  let api: ReturnType<typeof createMockApi>;
  let seenTokens: string[];
  let url: string;

  beforeEach(async () => {
    api = createMockApi();
    seenTokens = [];
    const factory: McpApiFactory = (token) => {
      seenTokens.push(token);
      if (new Set(["revoked"]).has(token)) {
        return {
          ...api,
          venues: { ...api.venues, list: vi.fn(async () => Promise.reject(problem(401))) },
        } as never;
      }
      return api as never;
    };
    app = Fastify({ logger: false });
    await app.register(rateLimit, { global: false });
    await app.register(mcpRoutes, {
      createApi: factory,
      rateLimit: { max: 1000, timeWindow: "1 minute" },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api/gen/mcp`;
  });

  afterEach(async () => {
    await app.close();
  });

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      })
    );
    return client;
  }

  it("answers 401 with WWW-Authenticate when no token is sent", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
  });

  it("answers 401 for a revoked or invalid token", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer revoked",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
  });

  it("lists exactly the four read tools plus list_venues, none of them writes", async () => {
    const client = await connect("mbe_pat_ok");
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "check_availability",
        "list_today_reservations",
        "list_venues",
        "lookup_reservation",
        "search_guests",
      ].sort()
    );
    expect([...MCP_TOOL_NAMES].sort()).toEqual(names);
    for (const name of names) expect(GEN_WRITE_TOOL_NAMES).not.toContain(name);
    // Each venue-scoped tool takes a venueId.
    for (const tool of tools.filter((t) => t.name !== "list_venues")) {
      expect(Object.keys(tool.inputSchema.properties ?? {})).toContain("venueId");
    }
    await client.close();
  });

  it("list_venues returns the venues the token's user belongs to, forwarding the bearer", async () => {
    const client = await connect("mbe_pat_ok");
    const result = await client.callTool({ name: "list_venues", arguments: {} });
    expect(JSON.stringify(result.content)).toContain("Bar Uno");
    expect(seenTokens.every((t) => t === "mbe_pat_ok")).toBe(true);
    await client.close();
  });

  it("check_availability happy path", async () => {
    const client = await connect("mbe_pat_ok");
    const result = await client.callTool({
      name: "check_availability",
      arguments: { venueId: "v1", date: "2026-12-01", partySize: 2 },
    });
    expect(result.isError).toBeFalsy();
    expect(api.availability.getPublicAvailability).toHaveBeenCalledWith("bar-uno", {
      date: "2026-12-01",
      partySize: 2,
    });
    await client.close();
  });

  it("lookup_reservation happy path", async () => {
    const client = await connect("mbe_pat_ok");
    const result = await client.callTool({
      name: "lookup_reservation",
      arguments: { venueId: "v1", date: "2026-12-01" },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain("Ana Lopez");
    await client.close();
  });

  it("search_guests happy path", async () => {
    const client = await connect("mbe_pat_ok");
    const result = await client.callTool({
      name: "search_guests",
      arguments: { venueId: "v1", query: "ana" },
    });
    expect(result.isError).toBeFalsy();
    expect(api.guests.search).toHaveBeenCalledWith({ venueId: "v1", query: "ana" });
    await client.close();
  });

  it("list_today_reservations happy path", async () => {
    const client = await connect("mbe_pat_ok");
    const result = await client.callTool({
      name: "list_today_reservations",
      arguments: { venueId: "v1", date: "2026-12-01" },
    });
    expect(result.isError).toBeFalsy();
    expect(api.reservations.list).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "v1", date: "2026-12-01" })
    );
    await client.close();
  });

  it("refuses a venue the token's user does not belong to without reading any data", async () => {
    const client = await connect("mbe_pat_ok");
    const result = await client.callTool({
      name: "search_guests",
      arguments: { venueId: "someone-elses", query: "ana" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Not a member");
    expect(api.guests.search).not.toHaveBeenCalled();
    await client.close();
  });

  it("rate limits per token", async () => {
    await app.close();
    app = Fastify({ logger: false });
    await app.register(rateLimit, { global: false });
    await app.register(mcpRoutes, {
      createApi: () => api as never,
      rateLimit: { max: 1, timeWindow: "1 minute" },
    });
    const init = (token: string) =>
      app.inject({
        method: "POST",
        url: "/api/gen/mcp",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${token}`,
        },
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
    await init("a");
    expect((await init("a")).statusCode).toBe(429);
    expect((await init("b")).statusCode).not.toBe(429);
  });

  it("sends no CORS headers to a foreign origin", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
