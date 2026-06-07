import { describe, it, expect, vi } from "vitest";
import type { FastifyBaseLogger, FastifyReply } from "fastify";
import { GEN_MODEL_ID, buildGenMessages, logGenCost, applyStreamHeaders } from "./gen-stream.js";

describe("gen-stream", () => {
  describe("buildGenMessages", () => {
    it("prepends a cache-controlled system message before the conversation", () => {
      const out = buildGenMessages("SYS", [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ]);

      expect(out).toHaveLength(3);
      expect(out[0]).toEqual({
        role: "system",
        content: "SYS",
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      });
      expect(out[1]).toEqual({ role: "user", content: "hi" });
      expect(out[2]).toEqual({ role: "assistant", content: "hello" });
    });

    it("handles an empty conversation (system message only)", () => {
      const out = buildGenMessages("SYS", []);
      expect(out).toHaveLength(1);
      expect(out[0].role).toBe("system");
    });
  });

  describe("logGenCost", () => {
    function fakeLog() {
      return { info: vi.fn() } as unknown as FastifyBaseLogger & { info: ReturnType<typeof vi.fn> };
    }

    it("logs usage + anthropic cache tokens under the given label", () => {
      const log = fakeLog();
      logGenCost(log, {
        userId: "u1",
        usage: { inputTokens: 10, outputTokens: 5 },
        providerMetadata: {
          anthropic: { cacheReadInputTokens: 7, cacheCreationInputTokens: 3 },
        },
        label: "gen-agent cost log",
      });

      expect(log.info).toHaveBeenCalledOnce();
      const [fields, label] = log.info.mock.calls[0];
      expect(label).toBe("gen-agent cost log");
      expect(fields).toMatchObject({
        userId: "u1",
        modelId: GEN_MODEL_ID,
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 7,
        cacheCreationInputTokens: 3,
      });
    });

    it("defaults cache tokens to 0 when provider metadata is absent", () => {
      const log = fakeLog();
      logGenCost(log, {
        usage: { inputTokens: 1, outputTokens: 1 },
        providerMetadata: undefined,
        label: "gen-chat cost log",
      });

      const [fields] = log.info.mock.calls[0];
      expect(fields.cacheReadInputTokens).toBe(0);
      expect(fields.cacheCreationInputTokens).toBe(0);
    });
  });

  describe("applyStreamHeaders", () => {
    it("sets the given content type plus the shared streaming headers", () => {
      const header = vi.fn();
      const reply = { header } as unknown as FastifyReply;

      applyStreamHeaders(reply, "text/plain; charset=utf-8");

      expect(header).toHaveBeenCalledWith("Content-Type", "text/plain; charset=utf-8");
      expect(header).toHaveBeenCalledWith("Cache-Control", "no-cache");
      expect(header).toHaveBeenCalledWith("Connection", "keep-alive");
      expect(header).toHaveBeenCalledWith("X-Accel-Buffering", "no");
    });
  });
});
