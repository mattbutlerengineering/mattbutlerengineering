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
