import { describe, it, expect } from "vitest";
import { genSpecCacheKey } from "./gen-spec-cache.js";

const base = {
  route: "gen-ui",
  messages: [{ role: "user" as const, content: "a pricing table" }],
  modelId: "claude-haiku-5-5",
  systemPrompt: "catalog prompt v1",
  maxOutputTokens: 2048,
};

describe("genSpecCacheKey", () => {
  it("is stable for identical inputs", () => {
    expect(genSpecCacheKey(base)).toBe(genSpecCacheKey({ ...base }));
  });

  it("ignores trivial whitespace differences in message content", () => {
    const spaced = {
      ...base,
      messages: [{ role: "user" as const, content: "  a   pricing\n table " }],
    };
    expect(genSpecCacheKey(spaced)).toBe(genSpecCacheKey(base));
  });

  it("misses when the prompt differs", () => {
    const other = { ...base, messages: [{ role: "user" as const, content: "a login form" }] };
    expect(genSpecCacheKey(other)).not.toBe(genSpecCacheKey(base));
  });

  it("misses when the model id changes", () => {
    expect(genSpecCacheKey({ ...base, modelId: "claude-sonnet-5-5" })).not.toBe(
      genSpecCacheKey(base)
    );
  });

  it("misses when the catalog-derived system prompt changes", () => {
    expect(genSpecCacheKey({ ...base, systemPrompt: "catalog prompt v2" })).not.toBe(
      genSpecCacheKey(base)
    );
  });

  it("misses when the output-token cap changes", () => {
    expect(genSpecCacheKey({ ...base, maxOutputTokens: 4096 })).not.toBe(genSpecCacheKey(base));
  });

  it("misses across routes", () => {
    expect(genSpecCacheKey({ ...base, route: "gen-other" })).not.toBe(genSpecCacheKey(base));
  });

  it("does not collide when content moves between messages", () => {
    const one = {
      ...base,
      messages: [
        { role: "user" as const, content: "ab" },
        { role: "assistant" as const, content: "c" },
      ],
    };
    const two = {
      ...base,
      messages: [
        { role: "user" as const, content: "a" },
        { role: "assistant" as const, content: "bc" },
      ],
    };
    expect(genSpecCacheKey(one)).not.toBe(genSpecCacheKey(two));
  });
});
