import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GenRunner, GenRunnerConfig, GenStreamEvent } from "./gen-runner.js";

// Must mock before dynamic imports
vi.mock("ai", () => ({
  streamText: vi.fn(),
  tool: vi.fn((def: unknown) => def),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ provider: "anthropic", modelId: "claude-haiku-4.5" })),
}));

import { streamText } from "ai";
import { createGenRunner } from "./gen-runner.js";

async function* mockAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

const baseConfig: GenRunnerConfig = {
  systemPrompt: "You are a helpful assistant.",
  modelId: "claude-haiku-4.5",
  maxSteps: 5,
};

describe("createGenRunner", () => {
  let runner: GenRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = createGenRunner(baseConfig);
  });

  describe("tool dispatch", () => {
    it("calls streamText with provided tools", async () => {
      const mockTool = {
        description: "A test tool",
        inputSchema: { parse: vi.fn() },
        execute: vi.fn().mockResolvedValue({ result: "ok" }),
      };
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await runner.run(
        [{ role: "user", content: "test" }],
        { test_tool: mockTool },
        async () => {}
      );

      const call = vi.mocked(streamText).mock.calls[0]![0] as Record<string, unknown>;
      expect(call.tools).toMatchObject({ test_tool: mockTool });
    });

    it("passes stopWhen to streamText", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await runner.run([{ role: "user", content: "test" }], {}, async () => {});

      const call = vi.mocked(streamText).mock.calls[0]![0] as Record<string, unknown>;
      expect(call.stopWhen).toBeDefined();
    });

    it("emits tool_status events for non-write non-render tools", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "check_availability",
            input: { venueId: "v1" },
          },
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "check_availability",
            result: { slots: [] },
          },
        ]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "check" }], {}, async (event) => {
        events.push(event);
      });

      expect(events).toContainEqual({
        type: "tool_status",
        tool: "check_availability",
        status: "running",
      });
      expect(events).toContainEqual({
        type: "tool_status",
        tool: "check_availability",
        status: "complete",
      });
    });

    it("emits element events from render_component tool calls", async () => {
      const elementSpec = { id: "card-1", type: "Card", props: {}, children: [] };
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
        ]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "show" }], {}, async (event) => {
        events.push(event);
      });

      expect(events).toContainEqual({ type: "element", element: elementSpec });
      expect(events).toContainEqual({
        type: "tool_status",
        tool: "render_component",
        status: "complete",
      });
    });

    it("emits action_request for write tools", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
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

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "book" }], {}, async (event) => {
        events.push(event);
      });

      expect(events).toContainEqual({
        type: "action_request",
        actionId: "call-3",
        toolName: "create_reservation",
        toolInput: { guestName: "Smith", date: "2026-06-18" },
      });
    });
  });

  describe("permission denial", () => {
    it("emits permission_denied for blocked tool names", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          {
            type: "tool-call",
            toolCallId: "call-4",
            toolName: "WebSearch",
            input: { query: "bad" },
          },
        ]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "search" }], {}, async (event) => {
        events.push(event);
      });

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "permission_denied",
          toolName: "WebSearch",
        })
      );
    });
  });

  describe("streaming text events", () => {
    it("emits text events from text-delta", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          { type: "text-delta", text: "Hello " },
          { type: "text-delta", text: "world" },
        ]),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "hi" }], {}, async (event) => {
        events.push(event);
      });

      expect(events).toEqual([
        { type: "text", content: "Hello " },
        { type: "text", content: "world" },
      ]);
    });
  });

  describe("model failure surfacing", () => {
    // ai@7 does NOT throw when the underlying model call fails (e.g. a 529 or
    // 401) — it yields a `{type: "error"}` part on fullStream and completes
    // normally. Without handling it, runner.run() resolves as if nothing went
    // wrong: the caller sees zero events and a clean return, not a failure.
    it("throws when fullStream yields an error part (model call failed)", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          { type: "start" },
          { type: "error", error: new Error("529 overloaded") },
        ]),
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await expect(
        runner.run([{ role: "user", content: "hi" }], {}, async () => {})
      ).rejects.toThrow("529 overloaded");
    });

    // A schema-invalid tool input (the model's tool call doesn't match the
    // tool's inputSchema) emits `tool-error`, not `tool-call` — so it never
    // reaches handleToolCall's element/action_request/tool_status branches
    // either. Throwing on it is opt-in (`failOnToolError`): gen-ui sets it
    // because maxSteps is 1 (no possible retry); gen-agent (maxSteps 5) must
    // NOT set it — see the "does not throw" test below.
    it("throws on a tool-error part when failOnToolError is set (invalid tool input)", async () => {
      const strictRunner = createGenRunner({ ...baseConfig, failOnToolError: true });
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          {
            type: "tool-error",
            toolCallId: "call-1",
            toolName: "render_component",
            input: { bad: "shape" },
            error: new Error("invalid tool input"),
          },
        ]),
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await expect(
        strictRunner.run([{ role: "user", content: "hi" }], {}, async () => {})
      ).rejects.toThrow("invalid tool input");
    });

    // ai@7's own multi-step loop (stopWhen: stepCountIs(N), N > 1) resends a
    // tool-error to the model and continues the SAME fullStream with the
    // retried step's parts — confirmed against the real SDK with
    // MockLanguageModelV4 (a tool-error at step 1 followed by recovery text
    // at step 2, both surfacing on one `fullStream` iteration). Throwing here
    // unconditionally would kill gen-agent's turn before step 2 ever runs
    // (#5720 re-review: this broke gen-agent's real retry behavior).
    it("does not throw on tool-error by default — lets a later step's recovery text still arrive", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          {
            type: "tool-error",
            toolCallId: "call-1",
            toolName: "render_component",
            input: { bad: "shape" },
            error: new Error("invalid tool input"),
          },
          { type: "text-delta", text: "recovered" },
        ]),
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await expect(
        runner.run([{ role: "user", content: "hi" }], {}, async (event) => {
          events.push(event);
        })
      ).resolves.toBeUndefined();

      expect(events).toEqual([{ type: "text", content: "recovered" }]);
    });

    it("wraps a non-Error error value in an Error", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([{ type: "error", error: "529 overloaded" }]),
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await expect(
        runner.run([{ role: "user", content: "hi" }], {}, async () => {})
      ).rejects.toThrow("529 overloaded");
    });
  });

  describe("budget stop", () => {
    it("passes maxSteps to stepCountIs", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const { stepCountIs } = await import("ai");
      const runnerWith3 = createGenRunner({ ...baseConfig, maxSteps: 3 });
      await runnerWith3.run([{ role: "user", content: "hi" }], {}, async () => {});

      expect(stepCountIs).toHaveBeenCalledWith(3);
    });
  });

  describe("toolChoice", () => {
    it("passes toolChoice through to streamText when provided", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const forcedRunner = createGenRunner({
        ...baseConfig,
        toolChoice: { type: "tool", toolName: "render_component" },
      });
      await forcedRunner.run([{ role: "user", content: "hi" }], {}, async () => {});

      const call = vi.mocked(streamText).mock.calls[0]![0] as Record<string, unknown>;
      expect(call.toolChoice).toEqual({ type: "tool", toolName: "render_component" });
    });

    it("omits toolChoice when not provided", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await runner.run([{ role: "user", content: "hi" }], {}, async () => {});

      const call = vi.mocked(streamText).mock.calls[0]![0] as Record<string, unknown>;
      expect(call.toolChoice).toBeUndefined();
    });
  });

  describe("system prompt injection", () => {
    it("puts system prompt first in messages array with cache control", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await runner.run([{ role: "user", content: "hi" }], {}, async () => {});

      const call = vi.mocked(streamText).mock.calls[0]![0] as {
        messages: Array<{ role: string; content: string; providerOptions?: unknown }>;
      };
      expect(call.messages[0]).toMatchObject({
        role: "system",
        content: "You are a helpful assistant.",
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      });
    });
  });
});
