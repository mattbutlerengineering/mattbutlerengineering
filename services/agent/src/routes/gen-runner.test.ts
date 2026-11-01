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
  maxOutputTokens: 2048,
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

    // The SDK reports a schema-invalid call as a tool-call with `invalid: true`, then
    // resends the error to the model. A confirm bar for it could never execute.
    it("does not ask the user to confirm a write tool call whose input is invalid", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          {
            type: "tool-call",
            toolCallId: "call-4",
            toolName: "change_tonight_availability",
            input: { change: "pacing" },
            dynamic: true,
            invalid: true,
            error: new Error("pacing needs covers"),
          },
        ]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "pace it" }], {}, async (event) => {
        events.push(event);
      });

      expect(events.some((event) => event.type === "action_request")).toBe(false);
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

    // Live chat batch 8 (F29): text before a tool call and text after it are
    // separate steps, and joined bare they read "…for 2 people:Monday's slots…".
    it("starts a later step's text on a new paragraph", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          { type: "text-delta", text: "Here are the open times:" },
          { type: "finish-step", finishReason: "tool-calls" },
          { type: "text-delta", text: "Monday's slots" },
          { type: "text-delta", text: " run every 15 minutes." },
        ]),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "hi" }], {}, async (event) => {
        events.push(event);
      });

      expect(events).toEqual([
        { type: "text", content: "Here are the open times:" },
        { type: "text", content: "\n\nMonday's slots" },
        { type: "text", content: " run every 15 minutes." },
      ]);
    });

    it("adds no break before the first text when an earlier step had none", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          { type: "finish-step", finishReason: "tool-calls" },
          { type: "text-delta", text: "No bookings tonight." },
        ]),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "hi" }], {}, async (event) => {
        events.push(event);
      });

      expect(events).toEqual([{ type: "text", content: "No bookings tonight." }]);
    });
  });

  describe("output-token cap", () => {
    it("passes maxOutputTokens from config to streamText", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await runner.run([{ role: "user", content: "test" }], {}, async () => {});

      const call = vi.mocked(streamText).mock.calls[0]![0] as Record<string, unknown>;
      expect(call.maxOutputTokens).toBe(2048);
      expect(call.providerOptions).toEqual({
        anthropic: { thinking: { type: "disabled" }, toolStreaming: true },
      });
    });

    it("emits each element as its JSON closes, and does not emit it again on tool-call", async () => {
      const first = JSON.stringify({ key: "a", type: "Input", props: { label: "Field 1" } });
      const second = JSON.stringify({ key: "b", type: "Input", props: { label: "Field 2" } });
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          { type: "tool-input-start", id: "call-1", toolName: "render_component" },
          { type: "tool-input-delta", id: "call-1", delta: `{"elements":[${first},` },
          { type: "tool-input-delta", id: "call-1", delta: `${second}]}` },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "render_component",
            input: { elements: [JSON.parse(first), JSON.parse(second)] },
          },
        ]),
        usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      const events: GenStreamEvent[] = [];
      await runner.run([{ role: "user", content: "form" }], {}, async (event) => {
        events.push(event);
      });

      expect(events).toEqual([
        { type: "element", element: JSON.parse(first) },
        { type: "element", element: JSON.parse(second) },
      ]);
    });

    it("fails the run when the model stops with finishReason length (cap hit)", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          { type: "start" },
          { type: "finish-step", finishReason: "length" },
          { type: "finish", finishReason: "length" },
        ]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 2048 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await expect(
        runner.run([{ role: "user", content: "hi" }], {}, async () => {})
      ).rejects.toThrow(/maxOutputTokens \(2048\)/);
    });

    it("does not fail on a normal finishReason", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([
          { type: "finish-step", finishReason: "stop" },
          { type: "finish", finishReason: "stop" },
        ]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 10 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await expect(
        runner.run([{ role: "user", content: "hi" }], {}, async () => {})
      ).resolves.toBeUndefined();
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
    it("passes the system prompt via instructions with cache control, never inside messages", async () => {
      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockAsyncIterable([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3 }),
        providerMetadata: Promise.resolve({}),
      } as never);

      await runner.run([{ role: "user", content: "hi" }], {}, async () => {});

      const call = vi.mocked(streamText).mock.calls[0]![0] as {
        instructions: { role: string; content: string; providerOptions?: unknown };
        messages: Array<{ role: string; content: string }>;
      };
      expect(call.instructions).toMatchObject({
        role: "system",
        content: "You are a helpful assistant.",
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      });
      // ai@7 throws AI_InvalidPromptError on any system-role entry in messages.
      expect(call.messages.every((m) => m.role !== "system")).toBe(true);
    });
  });
});
