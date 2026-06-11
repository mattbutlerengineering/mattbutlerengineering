/**
 * Tests for issue agent frontmatter parsing (#2021).
 * An issue body may carry a fenced ```yaml agent block with per-issue
 * overrides for `mbe agent run`. Parsing must never throw — malformed
 * input degrades to "no overrides" with warnings.
 */
import { describe, it, expect } from "vitest";
import { parseAgentFrontmatter, flagsFromOverrides } from "../issue-frontmatter.js";

const body = (block: string) => `## What to build

Some feature.

${block}

## Acceptance criteria

- [ ] works
`;

describe("parseAgentFrontmatter", () => {
  it("returns no overrides when the body has no agent block", () => {
    const result = parseAgentFrontmatter(body(""));
    expect(result.overrides).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("ignores plain yaml blocks without the agent tag", () => {
    const result = parseAgentFrontmatter(body("```yaml\nmodel: haiku\n```"));
    expect(result.overrides).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("parses a full agent block", () => {
    const result = parseAgentFrontmatter(
      body("```yaml agent\nmodel: haiku\nbudget: 0.50\nmax_turns: 30\nadapter: auto\n```")
    );
    expect(result.warnings).toEqual([]);
    expect(result.overrides).toEqual({
      model: "haiku",
      budget: 0.5,
      maxTurns: 30,
      adapter: "auto",
    });
  });

  it("parses a partial agent block (only model)", () => {
    const result = parseAgentFrontmatter(body("```yaml agent\nmodel: opus\n```"));
    expect(result.warnings).toEqual([]);
    expect(result.overrides).toEqual({ model: "opus" });
  });

  it("returns null overrides with a warning on malformed yaml", () => {
    const result = parseAgentFrontmatter(body("```yaml agent\nmodel: [unclosed\n```"));
    expect(result.overrides).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects an unknown model tier with a warning, keeps valid fields", () => {
    const result = parseAgentFrontmatter(body("```yaml agent\nmodel: gpt-5\nbudget: 1.00\n```"));
    expect(result.overrides).toEqual({ budget: 1.0 });
    expect(result.warnings.some((w) => w.includes("model"))).toBe(true);
  });

  it("rejects an unknown adapter with a warning", () => {
    const result = parseAgentFrontmatter(body("```yaml agent\nadapter: copilot\n```"));
    expect(result.overrides).toBeNull();
    expect(result.warnings.some((w) => w.includes("adapter"))).toBe(true);
  });

  it("rejects non-positive budget and max_turns", () => {
    const result = parseAgentFrontmatter(body("```yaml agent\nbudget: -1\nmax_turns: 0\n```"));
    expect(result.overrides).toBeNull();
    expect(result.warnings.length).toBe(2);
  });

  it("caps budget at the safety ceiling with a warning", () => {
    const result = parseAgentFrontmatter(body("```yaml agent\nbudget: 50\n```"));
    expect(result.overrides).toEqual({ budget: 5 });
    expect(result.warnings.some((w) => w.includes("capped"))).toBe(true);
  });

  it("warns on unknown keys without failing known ones", () => {
    const result = parseAgentFrontmatter(
      body("```yaml agent\nmodel: sonnet\nverify: pnpm test\n```")
    );
    expect(result.overrides).toEqual({ model: "sonnet" });
    expect(result.warnings.some((w) => w.includes("verify"))).toBe(true);
  });

  it("uses only the first agent block when several exist", () => {
    const result = parseAgentFrontmatter(
      body("```yaml agent\nmodel: haiku\n```\n\n```yaml agent\nmodel: opus\n```")
    );
    expect(result.overrides).toEqual({ model: "haiku" });
    expect(result.warnings.some((w) => w.includes("multiple"))).toBe(true);
  });

  it("never throws on adversarial input", () => {
    for (const evil of ["```yaml agent", "```yaml agent\n```", " ", ""]) {
      expect(() => parseAgentFrontmatter(evil)).not.toThrow();
    }
  });
});

describe("flagsFromOverrides", () => {
  it("returns empty array for null overrides", () => {
    expect(flagsFromOverrides(null)).toEqual([]);
  });

  it("maps tier names to full model ids", () => {
    expect(flagsFromOverrides({ model: "haiku" })).toEqual([
      "--model",
      "claude-haiku-4-5-20251001",
    ]);
  });

  it("maps all fields to mbe agent run flags", () => {
    expect(
      flagsFromOverrides({ model: "sonnet", budget: 0.5, maxTurns: 30, adapter: "auto" })
    ).toEqual([
      "--model",
      "claude-sonnet-4-6",
      "--max-budget",
      "0.5",
      "--max-turns",
      "30",
      "--adapter",
      "auto",
    ]);
  });
});
