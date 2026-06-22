import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

// Must mock before importing buildApp or the factory
vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
  Output: { object: vi.fn() },
  tool: vi.fn((def: unknown) => def),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ provider: "anthropic", modelId: "claude-haiku-4.5" })),
}));

// Partial mock: keep real GEN_MODEL_ID/applyStreamHeaders, spy on logGenCost so we can
// assert the exact cost-log label flows through from each route's config.
vi.mock("./gen-stream.js", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, logGenCost: vi.fn() };
});

vi.mock("@mbe/rialto-catalog/catalog", () => ({
  catalog: { prompt: vi.fn(() => "mock system prompt") },
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
import Fastify from "fastify";
import { createGenRoute } from "./gen-route-factory.js";
import { logGenCost } from "./gen-stream.js";

async function* mockStream<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

const ChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

function buildTestApp() {
  const app = Fastify({ logger: false });
  return app;
}

describe("createGenRoute factory", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  describe("parsing and validation", () => {
    beforeEach(async () => {
      app = buildTestApp();
      const route = createGenRoute({
        path: "/api/test/chat",
        costLogLabel: "test-chat cost log",
        rateLimit: { max: 50, timeWindow: "1 hour" },
        schema: ChatSchema,
        streamFormat: "text",
        maxSteps: 1,
        getTools: async () => ({}),
      });
      await app.register(route);
      await app.ready();
    });

    it("returns 400 when messages field is missing", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/test/chat",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { status: number };
      expect(body.status).toBe(400);
    });

    it("returns 400 when messages contain invalid roles", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/test/chat",
        payload: { messages: [{ role: "system", content: "hi" }] },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("text/plain stream format", () => {
    beforeEach(async () => {
      app = buildTestApp();
      const route = createGenRoute({
        path: "/api/test/chat",
        costLogLabel: "test-chat cost log",
        rateLimit: { max: 50, timeWindow: "1 hour" },
        schema: ChatSchema,
        streamFormat: "text",
        maxSteps: 1,
        getTools: async () => ({}),
      });
      await app.register(route);
      await app.ready();
    });

    it("sets Content-Type to text/plain; charset=utf-8", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/test/chat",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      expect(response.headers["content-type"]).toBe("text/plain; charset=utf-8");
    });

    it("sets Cache-Control, Connection, X-Accel-Buffering headers", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/test/chat",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      expect(response.headers["cache-control"]).toBe("no-cache");
      expect(response.headers["connection"]).toBe("keep-alive");
      expect(response.headers["x-accel-buffering"]).toBe("no");
    });

    it("streams plain text (not JSON) from text events", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([
          { type: "text-delta", text: "Hello" },
          { type: "text-delta", text: " world" },
        ]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/test/chat",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      expect(response.statusCode).toBe(200);
      // text/plain: raw text, not JSON lines
      expect(response.body).toBe("Hello world");
    });
  });

  describe("NDJSON stream format", () => {
    const AgentSchema = z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      venueId: z.string().optional(),
    });

    beforeEach(async () => {
      app = buildTestApp();
      const route = createGenRoute({
        path: "/api/test/agent",
        costLogLabel: "test-agent cost log",
        rateLimit: { max: 30, timeWindow: "1 hour" },
        schema: AgentSchema,
        streamFormat: "ndjson",
        maxSteps: 5,
        getTools: async () => ({}),
      });
      await app.register(route);
      await app.ready();
    });

    it("sets Content-Type to application/x-ndjson; charset=utf-8", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/test/agent",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      expect(response.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");
    });

    it("frames events as NDJSON lines (JSON + newline per event)", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([
          { type: "text-delta", text: "Hello" },
          { type: "text-delta", text: " world" },
        ]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/test/agent",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      expect(response.statusCode).toBe(200);
      const lines = response.body
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));

      expect(lines).toEqual([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
      ]);
    });

    it("NDJSON lines are terminated with newline character (byte-identical framing)", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([{ type: "text-delta", text: "Hi" }]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/test/agent",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      // Each line must end with exactly one newline
      const body = response.body;
      const expectedLine = JSON.stringify({ type: "text", content: "Hi" }) + "\n";
      expect(body).toBe(expectedLine);
    });
  });

  describe("cost logging", () => {
    beforeEach(async () => {
      app = buildTestApp();
      const route = createGenRoute({
        path: "/api/test/chat",
        costLogLabel: "test-chat cost log",
        rateLimit: { max: 50, timeWindow: "1 hour" },
        schema: ChatSchema,
        streamFormat: "text",
        maxSteps: 1,
        getTools: async () => ({}),
      });
      await app.register(route);
      await app.ready();
    });

    it("calls streamText with an onFinish callback", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await app.inject({
        method: "POST",
        url: "/api/test/chat",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      const call = vi.mocked(streamText).mock.calls[0]![0] as { onFinish?: unknown };
      expect(typeof call.onFinish).toBe("function");
    });

    it("passes the route's configured costLogLabel to logGenCost", async () => {
      vi.mocked(logGenCost).mockClear();
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await app.inject({
        method: "POST",
        url: "/api/test/chat",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      const call = vi.mocked(streamText).mock.calls[0]![0] as {
        onFinish?: (a: { usage: unknown; providerMetadata: unknown }) => Promise<void>;
      };
      await call.onFinish!({ usage: { inputTokens: 5, outputTokens: 3 }, providerMetadata: {} });

      expect(vi.mocked(logGenCost)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ label: "test-chat cost log" })
      );
    });
  });

  describe("system prompt + prompt caching", () => {
    beforeEach(async () => {
      app = buildTestApp();
      const route = createGenRoute({
        path: "/api/test/chat",
        costLogLabel: "test-chat cost log",
        rateLimit: { max: 50, timeWindow: "1 hour" },
        schema: ChatSchema,
        streamFormat: "text",
        maxSteps: 1,
        getTools: async () => ({}),
      });
      await app.register(route);
      await app.ready();
    });

    it("injects system prompt first with ephemeral cache control", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await app.inject({
        method: "POST",
        url: "/api/test/chat",
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      const call = vi.mocked(streamText).mock.calls[0]![0] as {
        messages: Array<{ role: string; content: string; providerOptions?: unknown }>;
      };

      expect(call.messages[0]).toMatchObject({
        role: "system",
        content: "mock system prompt",
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      });
    });
  });

  describe("getTools integration", () => {
    it("passes parsed body to getTools so route-specific tools can be constructed", async () => {
      const getTools = vi.fn().mockResolvedValue({});
      app = buildTestApp();
      const AgentSchema = z.object({
        messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
        venueId: z.string().optional(),
      });
      const route = createGenRoute({
        path: "/api/test/agent",
        costLogLabel: "test-agent cost log",
        rateLimit: { max: 30, timeWindow: "1 hour" },
        schema: AgentSchema,
        streamFormat: "ndjson",
        maxSteps: 5,
        getTools,
      });
      await app.register(route);
      await app.ready();

      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await app.inject({
        method: "POST",
        url: "/api/test/agent",
        payload: { messages: [{ role: "user", content: "hello" }], venueId: "venue-123" },
      });

      expect(getTools).toHaveBeenCalledOnce();
      const [, parsed] = getTools.mock.calls[0] as [unknown, { venueId?: string }];
      expect(parsed.venueId).toBe("venue-123");
    });
  });
});
