import { describe, it, expect } from "vitest";
import { createMockClaudeClient } from "../mock-claude-client.js";

async function drainGenerator(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const results: unknown[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

describe("createMockClaudeClient", () => {
  describe("deterministic mode", () => {
    it("returns a result message for every call", async () => {
      const client = createMockClaudeClient();
      const messages = await drainGenerator(client.query({ prompt: "Fix the bug" }));
      expect(messages).toHaveLength(1);
      const msg = messages[0] as { type: string; subtype: string };
      expect(msg.type).toBe("result");
      expect(msg.subtype).toBe("success");
    });

    it("records call history", async () => {
      const client = createMockClaudeClient();
      await drainGenerator(client.query({ prompt: "Task one", model: "claude-haiku-4-5" }));
      await drainGenerator(client.query({ prompt: "Task two" }));

      expect(client.calls).toHaveLength(2);
      expect(client.calls[0].prompt).toBe("Task one");
      expect(client.calls[0].model).toBe("claude-haiku-4-5");
      expect(client.calls[1].prompt).toBe("Task two");
    });

    it("accumulates total cost across calls", async () => {
      const client = createMockClaudeClient({ deterministicCostUsd: 0.05 });
      await drainGenerator(client.query({ prompt: "call 1" }));
      await drainGenerator(client.query({ prompt: "call 2" }));

      expect(client.totalCostUsd()).toBeCloseTo(0.1);
    });

    it("accumulates total token usage across calls", async () => {
      const client = createMockClaudeClient({
        deterministicTokens: { input: 1000, output: 200 },
      });
      await drainGenerator(client.query({ prompt: "a" }));
      await drainGenerator(client.query({ prompt: "b" }));

      const usage = client.totalTokenUsage();
      expect(usage.input).toBe(2000);
      expect(usage.output).toBe(400);
    });

    it("uses custom token counts in result message", async () => {
      const client = createMockClaudeClient({
        deterministicTokens: { input: 500, output: 100 },
        deterministicCostUsd: 0.002,
      });
      const messages = await drainGenerator(client.query({ prompt: "task" }));
      const result = messages[0] as {
        total_cost_usd: number;
        usage: { input_tokens: number; output_tokens: number };
      };
      expect(result.total_cost_usd).toBeCloseTo(0.002);
      expect(result.usage.input_tokens).toBe(500);
      expect(result.usage.output_tokens).toBe(100);
    });
  });

  describe("replay mode", () => {
    it("yields messages from fixture sequences in order", async () => {
      const fixture1 = [
        { type: "system", subtype: "init" },
        {
          type: "result",
          subtype: "success",
          uuid: "u1",
          session_id: "s1",
          duration_ms: 1000,
          duration_api_ms: 900,
          is_error: false,
          num_turns: 2,
          result: "done",
          stop_reason: "end_turn",
          total_cost_usd: 0.01,
          usage: {
            input_tokens: 500,
            output_tokens: 100,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
        },
      ];

      const client = createMockClaudeClient({ mode: "replay", fixtures: [fixture1] });
      const messages = await drainGenerator(client.query({ prompt: "replay test" }));

      expect(messages).toHaveLength(2);
      expect((messages[0] as { type: string }).type).toBe("system");
      expect((messages[1] as { type: string }).type).toBe("result");
    });

    it("cycles through fixtures when exhausted", async () => {
      const fixture = [
        {
          type: "result",
          subtype: "success",
          uuid: "u",
          session_id: "s",
          duration_ms: 100,
          duration_api_ms: 90,
          is_error: false,
          num_turns: 1,
          result: "ok",
          stop_reason: "end_turn",
          total_cost_usd: 0.001,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
        },
      ];
      const client = createMockClaudeClient({ mode: "replay", fixtures: [fixture] });

      await drainGenerator(client.query({ prompt: "call 1" }));
      await drainGenerator(client.query({ prompt: "call 2" }));

      // Both calls should have succeeded (fixture cycled)
      expect(client.calls).toHaveLength(2);
    });
  });

  describe("error injection", () => {
    it("throws on the specified call number", async () => {
      const client = createMockClaudeClient({
        errorOnCall: 2,
        errorToInject: new Error("Rate limit exceeded"),
      });

      // First call should succeed
      await drainGenerator(client.query({ prompt: "call 1" }));

      // Second call should throw
      await expect(drainGenerator(client.query({ prompt: "call 2" }))).rejects.toThrow(
        "Rate limit exceeded"
      );
    });

    it("throws immediately when errorOnCall is 1", async () => {
      const client = createMockClaudeClient({
        errorOnCall: 1,
        errorToInject: new Error("Connection timeout"),
      });

      await expect(drainGenerator(client.query({ prompt: "will fail" }))).rejects.toThrow(
        "Connection timeout"
      );
    });
  });

  describe("reset", () => {
    it("clears call history and resets counters", async () => {
      const client = createMockClaudeClient({ deterministicCostUsd: 0.05 });
      await drainGenerator(client.query({ prompt: "call before reset" }));

      expect(client.calls).toHaveLength(1);
      expect(client.totalCostUsd()).toBeCloseTo(0.05);

      client.reset();

      expect(client.calls).toHaveLength(0);
      expect(client.totalCostUsd()).toBe(0);
    });
  });
});
