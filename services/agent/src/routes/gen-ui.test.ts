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
import { flatToTree } from "@json-render/react";
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
            content: expect.stringContaining("mock system prompt"),
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

  it("accepts json-render's key/parentKey FlatElement shape and rejects the old id/children shape", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "a booking form" },
    });

    const call = vi.mocked(streamText).mock.calls[0]![0] as unknown as {
      tools: {
        render_component: {
          inputSchema: { safeParse: (v: unknown) => { success: boolean } };
        };
      };
    };
    const schema = call.tools.render_component.inputSchema;

    // Correct FlatElement shape (@json-render/core): key + optional parentKey.
    expect(
      schema.safeParse({ elements: [{ key: "root-1", type: "Card", props: {} }] }).success
    ).toBe(true);
    // The old, wrong shape this route shipped with (#5714 review) — flatToTree
    // never reads id/children, so this must no longer validate.
    expect(
      schema.safeParse({ elements: [{ id: "1", type: "Card", props: {}, children: [] }] }).success
    ).toBe(false);
  });

  it("accepts json-render's object-valued visible conditions, not just booleans", async () => {
    // catalog.prompt() teaches the model VisibilityCondition objects ($state/
    // $item/$index comparisons, $and/$or composition) as part of the render
    // contract — a boolean-only `visible` schema would reject exactly what
    // the model is instructed to produce (#5720 review).
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "a booking form" },
    });

    const call = vi.mocked(streamText).mock.calls[0]![0] as unknown as {
      tools: {
        render_component: {
          inputSchema: { safeParse: (v: unknown) => { success: boolean } };
        };
      };
    };
    const schema = call.tools.render_component.inputSchema;

    expect(
      schema.safeParse({
        elements: [{ key: "root-1", type: "Card", props: {}, visible: true }],
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        elements: [
          { key: "root-1", type: "Card", props: {}, visible: { $state: "/count", gt: 5 } },
        ],
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        elements: [
          {
            key: "root-1",
            type: "Card",
            props: {},
            visible: { $and: [{ $state: "/isOpen" }, { $index: true, eq: 0 }] },
          },
        ],
      }).success
    ).toBe(true);
  });

  it("streams raw flat elements as NDJSON — no envelope, matching apps/gen's useGenStream contract", async () => {
    // FlatElement shape per @json-render/core: `key` identifies the element,
    // `parentKey` (absent/null for root) links it into the tree. NOT `id`/`children`
    // — flatToTree's real implementation (dist/index.mjs) keys on key/parentKey only.
    const elementA = { key: "root-1", type: "heading", props: { children: "Title" } };
    const elementB = {
      key: "child-1",
      parentKey: "root-1",
      type: "paragraph",
      props: { children: "Body" },
    };

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

  it("produces a stream the REAL, unmocked flatToTree can assemble into a non-empty tree", async () => {
    const elementA = { key: "root-1", type: "Card", props: { title: "Book a table" } };
    const elementB = {
      key: "child-1",
      parentKey: "root-1",
      type: "Text",
      props: { children: "Pick a time" },
    };
    const elementC = {
      key: "child-2",
      parentKey: "root-1",
      type: "Button",
      props: { label: "Confirm" },
    };

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "render_component",
          input: { elements: [elementA, elementB, elementC] },
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

    const elements = response.body
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    // No mock of @json-render/react in this file — this is the actual published
    // flatToTree, exercised the same way the gen playground's useGenStream does.
    const tree = flatToTree(elements);

    expect(tree.root).toBe("root-1");
    expect(Object.keys(tree.elements)).toHaveLength(3);
    expect(tree.elements["root-1"]?.children).toEqual(
      expect.arrayContaining(["child-1", "child-2"])
    );
  });

  it("forces the model to call render_component via toolChoice", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "a booking form" },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        toolChoice: { type: "tool", toolName: "render_component" },
      })
    );
  });

  it("accepts a large refinement prompt that embeds an existing spec", async () => {
    // At least one element must be emitted, or the zero-elements-is-a-failure
    // check below turns this into a 500 for a reason unrelated to what this
    // test is actually verifying (schema acceptance of a large prompt).
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "render_component",
          input: { elements: [{ key: "root-1", type: "Card", props: {} }] },
        },
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "render_component",
          result: { rendered: true },
        },
      ]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    // createRefinementPrompt (apps/gen) embeds the full existing spec JSON in
    // the prompt string — a modest real spec easily exceeds a 2000-char cap.
    const largePrompt =
      "Here is an existing UI spec generated from Rialto components. " +
      "Please modify it according to the user's instruction.\n\n" +
      `Existing spec:\n${JSON.stringify({ filler: "x".repeat(5000) })}\n\n` +
      "Modification requested: make the button bigger";
    expect(largePrompt.length).toBeGreaterThan(2000);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: largePrompt },
    });

    expect(response.statusCode).toBe(200);
  });

  it("surfaces a mid-stream runner failure as an error, not a silently-truncated 200", async () => {
    // Yields one real element, THEN fails — the dangerous case: swallowing
    // the error (the pre-fix behavior, a bare `finally { controller.close() }`)
    // delivers a 200 with a truncated-but-valid-looking NDJSON body, which the
    // client reads as a complete, successful generation instead of a failed
    // one. Once a chunk has already been enqueued, erroring the stream tears
    // down the in-flight response instead of completing it cleanly — verified
    // empirically that `app.inject()` rejects in that case (the underlying
    // connection is destroyed, matching what a real client's fetch reader
    // would see: a stream error, not a clean HTTP status).
    async function* oneElementThenThrow(): AsyncGenerator<unknown> {
      yield {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "render_component",
        input: { elements: [{ key: "root-1", type: "Card", props: {} }] },
      };
      throw new Error("model call failed mid-stream");
    }

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: oneElementThenThrow(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    await expect(
      app.inject({
        method: "POST",
        url: "/api/gen/ui",
        payload: { prompt: "a booking form" },
      })
    ).rejects.toThrow();
  });

  it("fails instead of silently returning 200 when the model call itself fails (ai@7 error part, no throw)", async () => {
    // Reproduces the exact shape ai@7.0.106's streamText produces for a
    // failed model call (e.g. 529/401): a `{type: "error"}` part on
    // fullStream, no thrown exception, stream ends normally. Confirmed via
    // MockLanguageModelV4: `threw:false parts:['start','error']`.
    //
    // Unlike the mid-stream case above, no chunk has been enqueued before
    // this fails — controller.error() fires inside the ReadableStream's
    // start(), before any bytes reach the wire, so Fastify replies with a
    // clean 500 rather than tearing down an in-flight connection. Verified
    // empirically against two bare-Fastify probes: a zero-enqueue
    // controller.error() always resolves app.inject(), never rejects it.
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        { type: "start" },
        { type: "error", error: new Error("529 overloaded") },
      ]),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "a booking form" },
    });

    expect(response.statusCode).toBe(500);
  });

  it("fails instead of silently returning a 200 empty body when zero elements were produced", async () => {
    // No error, no throw — the model just completes a step without ever
    // calling render_component with a non-empty elements array. Belt-and-
    // suspenders on top of the error/tool-error handling above: an empty
    // generation is exactly as useless to the client as a failed one, and
    // both must be distinguishable from "worked, rendered nothing". Same
    // zero-enqueue reasoning as the test above: this resolves 500, it
    // doesn't reject app.inject().
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: mockAsyncIterable([
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "render_component",
          input: { elements: [] },
        },
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "render_component",
          result: { rendered: true },
        },
      ]),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      providerMetadata: Promise.resolve({}),
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/gen/ui",
      payload: { prompt: "a booking form" },
    });

    expect(response.statusCode).toBe(500);
  });
});
