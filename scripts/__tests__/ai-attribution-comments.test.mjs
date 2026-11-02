import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/ai-attribution.yml", import.meta.url)),
  "utf-8"
);

describe("ai-attribution.yml comments describe the signal accurately (#8055)", () => {
  it("has no dangling memory/REFLECTIONS.md reference", () => {
    expect(src).not.toContain("memory/REFLECTIONS.md");
  });

  it("does not claim the trailer is disabled or cite a user-level settings path", () => {
    expect(src).not.toMatch(/globally disabled/i);
    expect(src).not.toContain("~/.claude/settings.json");
  });

  it("does not call Signal 3 dormant", () => {
    expect(src).not.toContain("if attribution is re-enabled in the future");
  });

  it("warns that the trailer must not be read as human intervention (#5638)", () => {
    expect(src).toMatch(/#5638/);
    expect(src).toMatch(/not[\s\S]{0,60}human/i);
  });
});
