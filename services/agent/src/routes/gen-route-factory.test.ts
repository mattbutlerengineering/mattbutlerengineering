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

// Spend ceiling storage is Postgres-backed; stub it so tests drive the ceiling directly.
vi.mock("../services/gen-spend-ceiling.js", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    getGenSpendToday: vi.fn(async () => ({ generations: 0, costMicroUsd: 0 })),
    recordGenSpend: vi.fn(async () => {}),
    getGenDailyCeilingUsd: vi.fn(() => 2),
  };
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
  requireOwnershipOrAdmin: vi.fn(() => vi.fn(async () => {})),
}));

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
import rateLimit from "@fastify/rate-limit";
import { requireAuth } from "@mbe/auth/fastify";
import { createGenRoute } from "./gen-route-factory.js";
import { logGenCost } from "./gen-stream.js";
import { getGenSpendToday, recordGenSpend } from "../services/gen-spend-ceiling.js";

async function* mockStream<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

const ChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

function buildTestApp() {
  const app = Fastify({ logger: false });
  // The factory builds its per-identity limiter from the service's rate-limit plugin.
  void app.register(rateLimit, { global: false });
  return app;
}

const TEST_PATH = {
  chat: "/api/test/chat",
  agent: "/api/test/agent",
  fail: "/api/test/fail",
  empty: "/api/test/empty",
  custom: "/api/test/custom",
} as const;

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
        path: TEST_PATH.chat,
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
        url: TEST_PATH.chat,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { status: number };
      expect(body.status).toBe(400);
    });

    it("returns 400 when messages contain invalid roles", async () => {
      const response = await app.inject({
        method: "POST",
        url: TEST_PATH.chat,
        payload: { messages: [{ role: "system", content: "hi" }] },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("text/plain stream format", () => {
    beforeEach(async () => {
      app = buildTestApp();
      const route = createGenRoute({
        path: TEST_PATH.chat,
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
        fullStream: mockStream([{ type: "text-delta", text: "x" }]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: TEST_PATH.chat,
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      expect(response.headers["content-type"]).toBe("text/plain; charset=utf-8");
    });

    it("sets Cache-Control, Connection, X-Accel-Buffering headers", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([{ type: "text-delta", text: "x" }]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: TEST_PATH.chat,
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
        url: TEST_PATH.chat,
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
        path: TEST_PATH.agent,
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
        fullStream: mockStream([{ type: "text-delta", text: "x" }]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: TEST_PATH.agent,
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
        url: TEST_PATH.agent,
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
        url: TEST_PATH.agent,
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      // Each line must end with exactly one newline
      const body = response.body;
      const expectedLine = JSON.stringify({ type: "text", content: "Hi" }) + "\n";
      expect(body).toBe(expectedLine);
    });
  });

  describe("upstream model failure", () => {
    const cases = [
      { format: "text" as const, status: 529 },
      { format: "text" as const, status: 401 },
      { format: "ndjson" as const, status: 529 },
      { format: "ndjson" as const, status: 401 },
    ];

    it.each(cases)(
      "errors the $format stream on upstream $status instead of closing as an empty 200",
      async ({ format, status }) => {
        app = buildTestApp();
        await app.register(
          createGenRoute({
            path: TEST_PATH.fail,
            costLogLabel: "test-fail cost log",
            rateLimit: { max: 50, timeWindow: "1 hour" },
            schema: ChatSchema,
            streamFormat: format,
            maxSteps: 1,
            getTools: async () => ({}),
          })
        );
        await app.ready();
        vi.mocked(streamText).mockReturnValueOnce({
          fullStream: mockStream([
            { type: "error", error: Object.assign(new Error(`upstream ${status}`), { status }) },
          ]),
        } as never);

        const outcome = await app
          .inject({
            method: "POST",
            url: TEST_PATH.fail,
            payload: { messages: [{ role: "user", content: "hello" }] },
          })
          .then(
            (r) => ({ rejected: false as const, code: r.statusCode, body: r.body }),
            () => ({ rejected: true as const, code: 0, body: "" })
          );

        // A failed model call must be client-visible: an errored stream (fastify
        // answers with an error status while no bytes are sent) or an aborted
        // response — never a clean 200.
        // Upstream status/detail must not leak: always a generic 502.
        expect(outcome.rejected).toBe(false);
        expect(outcome.code).toBe(502);
        expect(outcome.body).not.toContain(`upstream ${status}`);
      }
    );
  });

  describe("zero-output guard", () => {
    it.each(["text", "ndjson"] as const)(
      "answers a 502, not an empty 200, when the %s runner returns with no output",
      async (format) => {
        app = buildTestApp();
        await app.register(
          createGenRoute({
            path: TEST_PATH.empty,
            costLogLabel: "test-empty cost log",
            rateLimit: { max: 50, timeWindow: "1 hour" },
            schema: ChatSchema,
            streamFormat: format,
            maxSteps: 1,
            getTools: async () => ({}),
          })
        );
        await app.ready();
        vi.mocked(streamText).mockReturnValueOnce({ fullStream: mockStream([]) } as never);

        const response = await app.inject({
          method: "POST",
          url: TEST_PATH.empty,
          payload: { messages: [{ role: "user", content: "hello" }] },
        });

        expect(response.statusCode).toBe(502);
      }
    );
  });

  describe("per-route runner and framing options", () => {
    const PromptSchema = z.object({ prompt: z.string() });

    async function registerCustom() {
      app = buildTestApp();
      await app.register(
        createGenRoute({
          path: TEST_PATH.custom,
          costLogLabel: "test-custom cost log",
          rateLimit: { max: 50, timeWindow: "1 hour" },
          schema: PromptSchema,
          streamFormat: "ndjson",
          maxSteps: 1,
          systemPrompt: "custom system prompt",
          toolChoice: { type: "tool", toolName: "render_component" },
          failOnToolError: true,
          toMessages: (parsed) => [{ role: "user", content: parsed.prompt }],
          serializeEvent: (event) => (event.type === "element" ? event.element : undefined),
          getTools: async () => ({}),
        })
      );
      await app.ready();
    }

    it("uses the route's system prompt, derived messages, and toolChoice", async () => {
      await registerCustom();
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "render_component",
            input: { elements: [{ key: "a", type: "Card" }] },
          },
        ]),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: TEST_PATH.custom,
        payload: { prompt: "a form" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(JSON.stringify({ key: "a", type: "Card" }) + "\n");
      const call = vi.mocked(streamText).mock.calls[0]![0] as {
        messages: Array<{ role: string; content: string }>;
        toolChoice: unknown;
      };
      expect(call.messages[0]!.content).toBe("custom system prompt");
      expect(call.messages[1]).toEqual({ role: "user", content: "a form" });
      expect(call.toolChoice).toEqual({ type: "tool", toolName: "render_component" });
    });

    it("counts only serialized events: non-element output alone is zero output (502)", async () => {
      await registerCustom();
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([{ type: "text-delta", text: "no tool call" }]),
      } as never);

      const response = await app.inject({
        method: "POST",
        url: TEST_PATH.custom,
        payload: { prompt: "a form" },
      });

      expect(response.statusCode).toBe(502);
    });
  });

  describe("cost logging", () => {
    beforeEach(async () => {
      app = buildTestApp();
      const route = createGenRoute({
        path: TEST_PATH.chat,
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
        fullStream: mockStream([{ type: "text-delta", text: "x" }]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await app.inject({
        method: "POST",
        url: TEST_PATH.chat,
        payload: { messages: [{ role: "user", content: "hello" }] },
      });

      const call = vi.mocked(streamText).mock.calls[0]![0] as { onFinish?: unknown };
      expect(typeof call.onFinish).toBe("function");
    });

    it("passes the route's configured costLogLabel to logGenCost", async () => {
      vi.mocked(logGenCost).mockClear();
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockStream([{ type: "text-delta", text: "x" }]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await app.inject({
        method: "POST",
        url: TEST_PATH.chat,
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
        path: TEST_PATH.chat,
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
        fullStream: mockStream([{ type: "text-delta", text: "x" }]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await app.inject({
        method: "POST",
        url: TEST_PATH.chat,
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
        path: TEST_PATH.agent,
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
        fullStream: mockStream([{ type: "text-delta", text: "x" }]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await app.inject({
        method: "POST",
        url: TEST_PATH.agent,
        payload: { messages: [{ role: "user", content: "hello" }], venueId: "venue-123" },
      });

      expect(getTools).toHaveBeenCalledOnce();
      const [, parsed] = getTools.mock.calls[0] as [unknown, { venueId?: string }];
      expect(parsed.venueId).toBe("venue-123");
    });
  });
});

describe("createGenRoute per-identity rate limit", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  async function buildLimitedApp(max: number) {
    // Mirrors createServiceApp: a service-wide onRequest limiter, where
    // request.user does not exist yet.
    app = Fastify({ logger: false });
    await app.register(rateLimit, { global: true, max: 1000, timeWindow: "1 hour" });
    vi.mocked(requireAuth).mockImplementation((async (req: {
      user?: { id: string };
      headers: Record<string, string | undefined>;
    }) => {
      req.user = { id: req.headers["x-user"] ?? "test-user" };
    }) as never);
    vi.mocked(streamText).mockImplementation(
      () =>
        ({
          fullStream: mockStream([]),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          providerMetadata: Promise.resolve({}),
        }) as never
    );
    await app.register(
      createGenRoute({
        path: TEST_PATH.chat,
        costLogLabel: "limit test",
        rateLimit: { max, timeWindow: "1 hour" },
        schema: ChatSchema,
        streamFormat: "text",
        maxSteps: 1,
        getTools: async () => ({}),
      })
    );
    await app.ready();
  }

  const post = (user: string) =>
    app.inject({
      method: "POST",
      url: TEST_PATH.chat,
      headers: { "x-user": user },
      remoteAddress: "10.0.0.1",
      payload: { messages: [] },
    });

  it("gives different authenticated subjects behind one IP their own bucket", async () => {
    await buildLimitedApp(2);

    expect((await post("alice")).statusCode).not.toBe(429);
    expect((await post("alice")).statusCode).not.toBe(429);
    expect((await post("alice")).statusCode).toBe(429);
    // Same IP, different subject: untouched by alice's exhausted bucket.
    expect((await post("bob")).statusCode).not.toBe(429);
  });
});

describe("aggregate spend ceiling", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildTestApp();
    await app.register(
      createGenRoute({
        path: TEST_PATH.chat,
        costLogLabel: "ceiling test",
        rateLimit: { max: 50, timeWindow: "1 hour" },
        schema: ChatSchema,
        streamFormat: "text",
        maxSteps: 1,
        getTools: async () => ({}),
      })
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  const post = () =>
    app.inject({
      method: "POST",
      url: TEST_PATH.chat,
      payload: { messages: [{ role: "user", content: "hi" }] },
    });

  it("refuses with a 503 problem+json distinct from a per-user rate limit once the ceiling is spent", async () => {
    vi.mocked(getGenSpendToday).mockResolvedValueOnce({
      generations: 99,
      costMicroUsd: 2_000_000,
    });

    const response = await post();

    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBeDefined();
    const body = JSON.parse(response.body) as { type: string; title: string; detail: string };
    expect(body.type).toBe("urn:mbe:problem:gen-spend-ceiling-reached");
    expect(body.title).toMatch(/spend ceiling/i);
    expect(vi.mocked(streamText)).not.toHaveBeenCalled();
  });

  it("allows generations while accumulated spend is under the ceiling", async () => {
    vi.mocked(getGenSpendToday).mockResolvedValueOnce({
      generations: 1,
      costMicroUsd: 1_999_999,
    });
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([{ type: "text-delta", text: "x" }]),
    } as never);

    expect((await post()).statusCode).toBe(200);
  });

  it("fails closed with a 503 when the counter cannot be read", async () => {
    vi.mocked(getGenSpendToday).mockRejectedValueOnce(new Error("db down"));

    const response = await post();

    expect(response.statusCode).toBe(503);
    expect(vi.mocked(streamText)).not.toHaveBeenCalled();
  });

  it("records actual usage, cache reads priced at the cache rate, when the run finishes", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockStream([{ type: "text-delta", text: "x" }]),
    } as never);
    await post();

    const call = vi.mocked(streamText).mock.calls[0]![0] as unknown as {
      onFinish: (a: { usage: unknown; providerMetadata: unknown }) => Promise<void>;
    };
    await call.onFinish({
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
      providerMetadata: { anthropic: { cacheReadInputTokens: 1_000_000 } },
    });

    expect(vi.mocked(recordGenSpend)).toHaveBeenCalledWith(10_000);
  });
});
