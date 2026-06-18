/**
 * Tests for the KV access helper.
 */

import { describe, it, expect } from "vitest";
import { readKvJson } from "./kv-access.js";

describe("readKvJson", () => {
  it("returns parsed JSON from KV", async () => {
    const kv = {
      get: async (key, format) => {
        if (key === "test-key" && format === "json") return { value: 42 };
        return null;
      },
    };
    const result = await readKvJson(kv, "test-key");
    expect(result).toEqual({ value: 42 });
  });

  it("returns null when key is missing", async () => {
    const kv = { get: async () => null };
    const result = await readKvJson(kv, "missing-key");
    expect(result).toBeNull();
  });

  it("returns null when KV throws", async () => {
    const kv = {
      get: async () => {
        throw new Error("KV unavailable");
      },
    };
    const result = await readKvJson(kv, "any-key");
    expect(result).toBeNull();
  });
});
