import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Must mock before importing buildApp
vi.mock("ai", () => ({
  streamText: vi.fn(),
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
}));

// Mock database and other service deps pulled in by app.ts → sessions route
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
}));

import { streamText } from "ai";
import { buildApp } from "../app.js";

describe("POST /api/gen/chat", () => {
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
      url: "/api/gen/chat",
      payload: { messages: [{ role: "user", content: "make a form" }] },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for missing messages", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/gen/chat",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("calls streamText with system prompt and user messages", async () => {
    const closedStream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const mockStream = {
      toUIMessageStream: vi.fn(() => closedStream),
    };
    vi.mocked(streamText).mockReturnValueOnce(mockStream as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/chat",
      payload: { messages: [{ role: "user", content: "make a form" }] },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockAnthropicModel,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: "mock system prompt",
          }),
          expect.objectContaining({
            role: "user",
            content: "make a form",
          }),
        ]),
      })
    );
  });

  it("applies prompt caching on system message", async () => {
    const closedStream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const mockStream = {
      toUIMessageStream: vi.fn(() => closedStream),
    };
    vi.mocked(streamText).mockReturnValueOnce(mockStream as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/chat",
      payload: { messages: [{ role: "user", content: "make a form" }] },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          }),
        ]),
      })
    );
  });
});
