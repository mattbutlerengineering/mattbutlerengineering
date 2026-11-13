import { describe, it, expect, vi, afterEach } from "vitest";

const googleModel = vi.fn((modelId: string) => ({ provider: "google", modelId }));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => googleModel),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn((modelId: string) => ({ provider: "anthropic", modelId })),
}));

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { genLanguageModel, genProviderOptions, resolveGenProvider } from "./gen-provider.js";

describe("gen-provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("resolveGenProvider", () => {
    it("defaults to anthropic when GEN_PROVIDER is unset or blank", () => {
      expect(resolveGenProvider(undefined)).toBe("anthropic");
      expect(resolveGenProvider("  ")).toBe("anthropic");
    });

    it("accepts both provider ids, ignoring case and whitespace", () => {
      expect(resolveGenProvider("anthropic")).toBe("anthropic");
      expect(resolveGenProvider(" Google ")).toBe("google");
    });

    it("throws on an unknown provider instead of silently falling back", () => {
      expect(() => resolveGenProvider("openai")).toThrow(/Unknown GEN_PROVIDER "openai"/);
    });
  });

  describe("genLanguageModel", () => {
    it("builds the anthropic model for the anthropic provider", () => {
      expect(genLanguageModel("anthropic", "claude-haiku-5-5")).toEqual({
        provider: "anthropic",
        modelId: "claude-haiku-5-5",
      });
    });

    it("builds the google model with the key from GEMINI_API_KEY", () => {
      vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

      expect(genLanguageModel("google", "gemini-3.1-flash-lite")).toEqual({
        provider: "google",
        modelId: "gemini-3.1-flash-lite",
      });
      expect(vi.mocked(createGoogleGenerativeAI)).toHaveBeenCalledWith({
        apiKey: "test-gemini-key",
      });
    });
  });

  describe("genProviderOptions", () => {
    it("disables thinking and streams tool input on anthropic", () => {
      expect(genProviderOptions("anthropic")).toEqual({
        anthropic: { thinking: { type: "disabled" }, toolStreaming: true },
      });
    });

    it("sends no provider options on google", () => {
      expect(genProviderOptions("google")).toBeUndefined();
    });
  });

  describe("gen-stream model selection", () => {
    it("selects the Gemini model and its pricing when GEN_PROVIDER=google", async () => {
      vi.stubEnv("GEN_PROVIDER", "google");
      vi.resetModules();

      const stream = await import("./gen-stream.js");

      expect(stream.GEN_PROVIDER).toBe("google");
      expect(stream.GEN_MODEL_ID).toBe("gemini-3.1-flash-lite");
      expect(stream.GEN_PRICING).toEqual({
        input: 0.25,
        output: 1.5,
        cacheRead: 0.025,
        cacheWrite: 0,
      });
    });

    it("keeps Haiku 5.5 when GEN_PROVIDER is unset", async () => {
      vi.stubEnv("GEN_PROVIDER", "");
      vi.resetModules();

      const stream = await import("./gen-stream.js");

      expect(stream.GEN_PROVIDER).toBe("anthropic");
      expect(stream.GEN_MODEL_ID).toBe("claude-haiku-5-5");
    });
  });
});
