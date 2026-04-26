import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Must mock before importing buildApp
vi.mock("ai", () => ({
  streamText: vi.fn(),
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

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../services/orchestrator.js", () => ({
  orchestratorService: {
    decompose: vi.fn(),
  },
}));

import { streamText } from "ai";
import { buildApp } from "../app.js";

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
      payload: { prompt: "a card" },
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

  it("returns 400 for prompt exceeding max length", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "a".repeat(2001) },
    });

    expect(response.statusCode).toBe(400);
  });

  it("calls streamText with correct sonnet model and system prompt with caching", async () => {
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
      url: "/api/gen/ui",
      payload: { prompt: "a card", model: "sonnet" },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-sonnet-4.6",
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: "mock system prompt",
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          }),
        ]),
      })
    );
  });

  it("defaults to haiku model when model not specified", async () => {
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
      url: "/api/gen/ui",
      payload: { prompt: "a card" },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-haiku-4.5",
      })
    );
  });
});
