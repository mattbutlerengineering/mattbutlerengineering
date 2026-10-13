import { describe, it, expect } from "vitest";
import { resolveEntry } from "./entry-kind.js";

describe("resolveEntry", () => {
  it("strips a legacy prefix once when kind is absent", () => {
    expect(resolveEntry({ prompt: "Failed: Recovered: make a form" })).toEqual({
      kind: "failed",
      prompt: "Recovered: make a form",
    });
  });

  it("does not sniff prefixes when kind is present", () => {
    expect(resolveEntry({ prompt: "Refined: is my literal text", kind: "generate" })).toEqual({
      kind: "generate",
      prompt: "Refined: is my literal text",
    });
  });
});
