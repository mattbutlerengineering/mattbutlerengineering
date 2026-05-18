import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Must mock before importing buildApp
vi.mock("ai", () => ({
  streamText: vi.fn(),
  tool: vi.fn((config) => config),
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

// Mock global fetch for tool execution tests
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      data: [
        { time: "18:00", available: true, partySize: 4 },
        { time: "18:30", available: true, partySize: 4 },
      ],
    }),
  })
);

import { streamText } from "ai";
import { buildApp } from "../app.js";

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
      payload: { messages: [{ role: "user", content: "check availability" }] },
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

  it("returns 400 for invalid message role", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "system", content: "bad role" }] },
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
      textStream: closedStream,
      toUIMessageStream: vi.fn(() => closedStream),
    };
    vi.mocked(streamText).mockReturnValueOnce(mockStream as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "check availability" }] },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("mock system prompt"),
          }),
          expect.objectContaining({
            role: "user",
            content: "check availability",
          }),
        ]),
      })
    );
  });

  it("includes check_availability tool in streamText call", async () => {
    const closedStream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const mockStream = {
      textStream: closedStream,
      toUIMessageStream: vi.fn(() => closedStream),
    };
    vi.mocked(streamText).mockReturnValueOnce(mockStream as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "check availability" }] },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          check_availability: expect.anything(),
        }),
      })
    );
  });

  it("applies rate limit of 30 req/hour per user", async () => {
    const closedStream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const mockStream = {
      textStream: closedStream,
      toUIMessageStream: vi.fn(() => closedStream),
    };
    vi.mocked(streamText).mockReturnValueOnce(mockStream as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "check availability" }] },
    });

    // Rate limit headers should be present
    expect(response.headers["x-ratelimit-limit"]).toBeDefined();
  });

  it("applies prompt caching on system message", async () => {
    const closedStream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const mockStream = {
      textStream: closedStream,
      toUIMessageStream: vi.fn(() => closedStream),
    };
    vi.mocked(streamText).mockReturnValueOnce(mockStream as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/agent",
      payload: { messages: [{ role: "user", content: "check availability" }] },
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
