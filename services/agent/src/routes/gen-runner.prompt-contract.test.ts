import { describe, it, expect, vi } from "vitest";

// This file deliberately uses the REAL `ai` package. Production broke
// (first-ever live generation, 2026-10-24) because streamText@7 rejects
// system-role entries inside `messages` with AI_InvalidPromptError ("Use the
// instructions option instead") — and every other gen test mocks `ai`, so its
// prompt-standardization contract was never exercised. Only the provider is
// stubbed: a minimal model whose stream ends immediately.
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({
    specificationVersion: "v3",
    provider: "anthropic",
    modelId: "claude-haiku-5-5",
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error("doGenerate not expected");
    },
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1 },
          });
          controller.close();
        },
      }),
    }),
  })),
}));

import { createGenRunner } from "./gen-runner.js";

describe("gen-runner prompt contract against the real ai package", () => {
  it("builds a prompt streamText accepts — no system message inside messages", async () => {
    const runner = createGenRunner({
      systemPrompt: "catalog prompt",
      modelId: "claude-haiku-5-5",
      maxOutputTokens: 128,
      maxSteps: 1,
    });

    let caught: Error | null = null;
    try {
      await runner.run([{ role: "user", content: "a card" }], {}, async () => {});
    } catch (err) {
      caught = err instanceof Error ? err : new Error(String(err));
    }

    // The stub model's stream shape may legitimately trip other SDK errors;
    // the one failure this test exists to forbid is prompt standardization
    // rejecting the runner's message shape.
    expect(caught?.name).not.toBe("AI_InvalidPromptError");
    expect(caught?.message ?? "").not.toContain("System messages are not allowed");
  });
});
