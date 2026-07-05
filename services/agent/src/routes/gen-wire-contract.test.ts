/**
 * Wire-format contract tests for gen-chat and gen-agent routes.
 *
 * These tests assert byte-identical wire formats: the Content-Type header,
 * exact body bytes, and framing of every event type. They must stay green
 * before and after the factory refactor to prove behavioral equivalence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
  Output: { object: vi.fn() },
  tool: vi.fn((def: unknown) => def),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ provider: "anthropic", modelId: "claude-haiku-4.5" })),
}));

vi.mock("@mbe/rialto-catalog/catalog", () => ({
  catalog: { prompt: vi.fn(() => "mock system prompt") },
}));

vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn(async (_f: unknown, _o: unknown) => {}),
  getAuthPluginOptionsFromEnv: vi.fn(() => ({})),
  requireAuth: vi.fn(async (req: { user?: { id: string } }) => {
    req.user = { id: "test-user" };
  }),
  requireOwnershipOrAdmin: vi.fn(() => vi.fn(async () => {})),
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

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("../services/orchestrator.js", () => ({
  orchestratorService: { decompose: vi.fn() },
}));

vi.mock("@mbe/agent-core", () => ({
  runSession: vi.fn(),
  DEFAULT_SESSION_CONFIG: {},
  DEFAULT_FEEDBACK_LOOP_CONFIG: {},
  resolveBudget: vi.fn(),
  resolveModel: vi.fn(),
  routeModelWithReason: vi.fn(),
  createSanitizedStream: vi.fn((stream: unknown) => stream),
  GEN_BLOCKED_TOOLS: new Set(["WebSearch", "WebFetch", "AskUserQuestion"]),
  genIsBashCommandBlocked: vi.fn(() => null),
}));

import { streamText } from "ai";
import { buildApp } from "../app.js";

async function* mockStream<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

// ── gen-chat wire contract (text/plain) ──────────────────────────────────────

describe("gen-chat wire contract (text/plain)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("Content-Type is exactly text/plain; charset=utf-8", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/chat",
      payload: { messages: [{ role: "user", content: "hello" }] },
    });

    expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
  });

  it("shared streaming headers are present", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/chat",
      payload: { messages: [{ role: "user", content: "hello" }] },
    });

    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["connection"]).toBe("keep-alive");
    expect(res.headers["x-accel-buffering"]).toBe("no");
  });

  it("body is concatenated raw text (not JSON, no framing)", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([
        { type: "text-delta", text: "Hello" },
        { type: "text-delta", text: ", " },
        { type: "text-delta", text: "world" },
      ]),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/chat",
      payload: { messages: [{ role: "user", content: "say hello" }] },
    });

    expect(res.statusCode).toBe(200);
    // Raw concatenated text — no JSON, no newlines between chunks
    expect(res.body).toBe("Hello, world");
  });

  it("non-text events (e.g. tool events) are silently dropped from text stream", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([
        {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "some_tool",
          input: {},
        },
        { type: "text-delta", text: "Done." },
      ]),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/chat",
      payload: { messages: [{ role: "user", content: "do something" }] },
    });

    // Only text events appear in the body
    expect(res.body).toBe("Done.");
  });
});

// ── gen-agent wire contract (application/x-ndjson) ──────────────────────────

describe("gen-agent wire contract (application/x-ndjson)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("Content-Type is exactly application/x-ndjson; charset=utf-8", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "hello" }] },
    });

    expect(res.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");
  });

  it("shared streaming headers are present", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "hello" }] },
    });

    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["connection"]).toBe("keep-alive");
    expect(res.headers["x-accel-buffering"]).toBe("no");
  });

  it("text events are framed as NDJSON: JSON object + exactly one newline", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([
        { type: "text-delta", text: "Hello" },
        { type: "text-delta", text: " world" },
      ]),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "hello" }] },
    });

    expect(res.statusCode).toBe(200);

    // Byte-exact: each line is JSON.stringify(event) + "\n"
    const expectedBody =
      JSON.stringify({ type: "text", content: "Hello" }) +
      "\n" +
      JSON.stringify({ type: "text", content: " world" }) +
      "\n";
    expect(res.body).toBe(expectedBody);
  });

  it("tool_status events are framed as NDJSON lines", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([
        {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "check_availability",
          input: { venueId: "v1" },
        },
        {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "check_availability",
          result: { slots: [] },
        },
      ]),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "check" }] },
    });

    const lines = res.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(lines).toEqual([
      { type: "tool_status", tool: "check_availability", status: "running" },
      { type: "tool_status", tool: "check_availability", status: "complete" },
    ]);
  });

  it("action_request events are framed as NDJSON lines", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([
        {
          type: "tool-call",
          toolCallId: "call-3",
          toolName: "create_reservation",
          input: { guestName: "Smith", date: "2026-06-18" },
        },
        {
          type: "tool-result",
          toolCallId: "call-3",
          toolName: "create_reservation",
          result: {},
        },
      ]),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "book" }] },
    });

    const lines = res.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(lines[0]).toEqual({
      type: "action_request",
      actionId: "call-3",
      toolName: "create_reservation",
      toolInput: { guestName: "Smith", date: "2026-06-18" },
    });
  });

  it("element events are framed as NDJSON lines", async () => {
    const elementSpec = { id: "card-1", type: "Card", props: { title: "Slots" }, children: [] };

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([
        {
          type: "tool-call",
          toolCallId: "c2",
          toolName: "render_component",
          input: { elements: [elementSpec] },
        },
        {
          type: "tool-result",
          toolCallId: "c2",
          toolName: "render_component",
          result: { rendered: true },
        },
      ]),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "show" }] },
    });

    const lines = res.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(lines).toContainEqual({ type: "element", element: elementSpec });
  });

  it("400 for missing messages field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("400 for missing messages field on gen-chat", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/gen/chat",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
