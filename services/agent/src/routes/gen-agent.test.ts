import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Must mock before importing buildApp
vi.mock("ai", () => ({
  streamText: vi.fn(),
  tool: vi.fn((def: unknown) => def),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
  Output: {
    object: vi.fn(),
  },
}));

vi.mock("@mbe/rialto-catalog/catalog", () => ({
  catalog: {
    prompt: vi.fn(() => "mock system prompt"),
  },
}));

vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn(async (_f: unknown, _o: unknown) => {}),
  getAuthPluginOptionsFromEnv: vi.fn(() => ({})),
  requireAuth: vi.fn(async (req: { user?: { id: string } }) => {
    req.user = { id: "test-user" };
  }),
}));

vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    addEvent: vi.fn(),
    listEvents: vi.fn(),
  },
}));

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1,
    idle: 4,
    busy: 1,
    size: 5,
    utilization: 0.2,
    isDegraded: false,
  }),
}));

vi.mock("../services/orchestrator.js", () => ({
  orchestratorService: {
    decompose: vi.fn(),
  },
}));

import { streamText } from "ai";
import { buildApp } from "../app.js";

async function* mockAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe("POST /api/gen/agent", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 401 without auth", async () => {
    const { requireAuth } = await import("@mbe/auth/fastify");
    vi.mocked(requireAuth).mockImplementationOnce(async (_req, reply) => {
      reply.code(401).send({
        type: "https://mattbutlerengineering.com/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Authentication required",
      });
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "hello" }] },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for missing messages", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("registers all 11 tools (5 read + render + 5 write)", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "hello" }] },
    });

    const call = vi.mocked(streamText).mock.calls[0]![0] as { tools: Record<string, unknown> };
    const toolNames = Object.keys(call.tools).sort();
    expect(toolNames).toEqual([
      "cancel_reservation",
      "check_availability",
      "create_reservation",
      "get_table_status",
      "list_today_reservations",
      "lookup_reservation",
      "modify_reservation",
      "render_component",
      "search_guests",
      "seat_walk_in",
      "update_table_status",
    ]);
  });

  it("calls streamText with tools and prompt caching", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "what is available?" }] },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-haiku-4.5",
        tools: expect.objectContaining({
          check_availability: expect.objectContaining({
            inputSchema: expect.anything(),
          }),
        }),
        stopWhen: expect.anything(),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: "mock system prompt",
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          }),
          expect.objectContaining({
            role: "user",
            content: "what is available?",
          }),
        ]),
      })
    );
  });

  it("streams tool_status events when tools are called", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "check_availability",
          input: { venueId: "v1", date: "2026-05-18", partySize: 4 },
        },
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "check_availability",
          result: { slots: [] },
        },
        { type: "text-delta", text: "No slots available." },
      ]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "what is available tonight?" }] },
    });

    const lines = response.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(lines).toEqual([
      { type: "tool_status", tool: "check_availability", status: "running" },
      { type: "tool_status", tool: "check_availability", status: "complete" },
      { type: "text", content: "No slots available." },
    ]);
  });

  it("streams element events from render_component tool results", async () => {
    const elementSpec = {
      id: "card-1",
      type: "Card",
      props: { title: "Available Slots" },
      children: [],
    };

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        {
          type: "tool-call",
          toolCallId: "call-2",
          toolName: "render_component",
          input: { elements: [elementSpec] },
        },
        {
          type: "tool-result",
          toolCallId: "call-2",
          toolName: "render_component",
          result: { rendered: true },
        },
        { type: "text-delta", text: "Here are the available slots." },
      ]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "show availability" }] },
    });

    const lines = response.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(lines).toEqual([
      { type: "element", element: elementSpec },
      {
        type: "tool_status",
        tool: "render_component",
        status: "complete",
      },
      { type: "text", content: "Here are the available slots." },
    ]);
  });

  it("emits action_request for write tool calls", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        {
          type: "tool-call",
          toolCallId: "call-3",
          toolName: "create_reservation",
          input: {
            guestName: "Smith",
            date: "2026-05-18",
            time: "19:00",
            partySize: 4,
          },
        },
        {
          type: "tool-result",
          toolCallId: "call-3",
          toolName: "create_reservation",
          result: { pending: true },
        },
        { type: "text-delta", text: "I've prepared a reservation for Smith." },
      ]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "book table 5 for Smith at 7pm" }] },
    });

    const lines = response.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(lines[0]).toEqual({
      type: "action_request",
      actionId: "call-3",
      toolName: "create_reservation",
      toolInput: {
        guestName: "Smith",
        date: "2026-05-18",
        time: "19:00",
        partySize: 4,
      },
    });
  });

  it("streams NDJSON text response", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        { type: "text-delta", text: "Hello" },
        { type: "text-delta", text: " world" },
      ]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "what is available tonight?" }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");

    const lines = response.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(lines).toEqual([
      { type: "text", content: "Hello" },
      { type: "text", content: " world" },
    ]);
  });
});
