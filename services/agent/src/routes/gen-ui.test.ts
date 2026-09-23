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

// Mock the direct Anthropic provider — returns a function that produces a model object
const mockAnthropicModel = {
  provider: "anthropic",
  modelId: "claude-haiku-4.5",
};
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => mockAnthropicModel),
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
  requireOwnershipOrAdmin: vi.fn(() => vi.fn(async () => {})),
}));

// Mock database and other service deps pulled in by app.ts → sessions route
vi.mock("../services/session.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    sessionService: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
      addEvent: vi.fn(),
      listEvents: vi.fn(),
    },
  };
});

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
  orchestratorService: {
    decompose: vi.fn(),
  },
}));

vi.mock("@mbe/agent-core", () => ({
  runSession: vi.fn(),
  DEFAULT_SESSION_CONFIG: {},
  DEFAULT_FEEDBACK_LOOP_CONFIG: {},
  resolveBudget: vi.fn(),
  resolveModel: vi.fn(),
  routeModelWithReason: vi.fn(),
  createSanitizedStream: vi.fn((stream: unknown) => stream),
  // Gen permission policy exports (used by gen-runner.ts)
  GEN_BLOCKED_TOOLS: new Set([
    "WebSearch",
    "WebFetch",
    "AskUserQuestion",
    "EnterPlanMode",
    "EnterWorktree",
  ]),
  genIsBashCommandBlocked: vi.fn(() => null),
}));

import { streamText } from "ai";
import { buildApp } from "../app.js";

async function* mockAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe("POST /api/gen/ui", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // Regression test for #5711: apps/gen's usePlaygroundSession streams from
  // this exact path. It was deleted from services/agent in b0c3cc449 (#1510)
  // without the client ever being re-pointed, and 404'd in prod for months.
  // A future deletion of this route must fail this test, not just prod.
  it("is registered on the agent service", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "make a form" },
    });

    expect(response.statusCode).not.toBe(404);
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
      url: "/api/gen/ui",
      payload: { prompt: "make a form" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for missing prompt", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("calls streamText with catalog system prompt and prompt caching", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([]),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "a booking form" },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockAnthropicModel,
        tools: expect.objectContaining({ render_component: expect.anything() }),
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
            content: "a booking form",
          }),
        ]),
      })
    );
  });

  it("streams raw flat elements as NDJSON — no envelope, matching apps/gen's useGenStream contract", async () => {
    const elementA = { id: "1", type: "heading", props: { children: "Title" } };
    const elementB = { id: "2", type: "paragraph", props: { children: "Body" } };

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "render_component",
          input: { elements: [elementA, elementB] },
        },
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "render_component",
          result: { rendered: true },
        },
      ]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "a booking form" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");

    const lines = response.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    // Every line is the flat element itself — no {type: "element", element} wrapper,
    // and no tool_status/text lines mixed in (that's gen-agent's chat-envelope contract).
    expect(lines).toEqual([elementA, elementB]);
  });
});
