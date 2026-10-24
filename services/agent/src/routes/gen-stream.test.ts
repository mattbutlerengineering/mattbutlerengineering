import { describe, it, expect, vi } from "vitest";
import type { FastifyBaseLogger, FastifyReply } from "fastify";
import {
  GEN_MODEL_ID,
  genSystemInstructions,
  logGenCost,
  applyStreamHeaders,
} from "./gen-stream.js";

describe("gen-stream", () => {
  describe("genSystemInstructions", () => {
    it("builds a cache-controlled system message for streamText's instructions option", () => {
      // ai@7 forbids system-role entries inside `messages`; the instructions
      // option accepts a SystemModelMessage so cacheControl is preserved.
      expect(genSystemInstructions("SYS")).toEqual({
        role: "system",
        content: "SYS",
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      });
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
      const infoCall = log.info.mock.calls[0];
      if (!infoCall) throw new Error("expected a log.info call");
      const [fields, label] = infoCall;
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

    it("logs run telemetry on the same line, leaving the existing fields untouched", () => {
      const log = fakeLog();
      logGenCost(log, {
        userId: "u1",
        usage: { inputTokens: 10, outputTokens: 5 },
        providerMetadata: undefined,
        label: "gen-ui cost log",
        telemetry: { ttftMs: 420, durationMs: 3100, elementCount: 12, finishReason: "stop" },
      });

      expect(log.info).toHaveBeenCalledOnce();
      const [fields, label] = log.info.mock.calls[0]!;
      expect(label).toBe("gen-ui cost log");
      expect(fields).toMatchObject({
        userId: "u1",
        modelId: GEN_MODEL_ID,
        inputTokens: 10,
        outputTokens: 5,
        ttftMs: 420,
        durationMs: 3100,
        elementCount: 12,
        finishReason: "stop",
      });
    });

    it("zeroes token and telemetry fields rather than omitting them", () => {
      const log = fakeLog();
      logGenCost(log, { usage: {}, label: "gen-ui cost log" });

      const [fields] = log.info.mock.calls[0]!;
      expect(fields).toMatchObject({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        ttftMs: 0,
        durationMs: 0,
        elementCount: 0,
        finishReason: "unknown",
      });
    });

    it("defaults cache tokens to 0 when provider metadata is absent", () => {
      const log = fakeLog();
      logGenCost(log, {
        usage: { inputTokens: 1, outputTokens: 1 },
        providerMetadata: undefined,
        label: "gen-ui cost log",
      });

      const infoCall = log.info.mock.calls[0];
      if (!infoCall) throw new Error("expected a log.info call");
      const [fields] = infoCall;
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
