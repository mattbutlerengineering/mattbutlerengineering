import { describe, expect, it } from "vitest";
import { hasReadableLiteral } from "./locale-sweep-readable.js";

describe("hasReadableLiteral", () => {
  it("rejects placeholder-only and connector-only values", () => {
    expect(hasReadableLiteral("{{count}}")).toBe(false);
    expect(hasReadableLiteral("{{from}} - {{to}}")).toBe(false);
    expect(hasReadableLiteral("{{from}} to {{to}}")).toBe(false);
    expect(hasReadableLiteral("{{current}} of {{total}}")).toBe(false);
  });

  it("keeps values with real literal English", () => {
    expect(hasReadableLiteral("Table {{name}}")).toBe(true);
    expect(hasReadableLiteral("{{minutes}} min")).toBe(true);
    expect(hasReadableLiteral("Reserve a table")).toBe(true);
  });
});
