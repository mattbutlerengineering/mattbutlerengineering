import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FILES_TO_CHECK } from "../detect-instruction-rot.mjs";

/**
 * The generation-side rule (docs/features/ui-quality-loop/architecture.md
 * § Components "Generation-side rule"): every UI-producing agent loads the
 * agent-built and accessibility tell list before writing UI, so the loop stops
 * refiling the same tell.
 */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RULE = ".claude/rules/ui-quality.md";
const read = (path) => readFileSync(join(REPO, path), "utf8");
const rubric = JSON.parse(read("docs/ui-quality/rubric.json"));
const rule = read(RULE);

describe(".claude/rules/ui-quality.md", () => {
  it("names every agent-built and accessibility tell id in the rubric", () => {
    const ids = rubric.tells
      .filter((t) => t.face === "agent-built" || t.face === "accessibility")
      .map((t) => t.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(rule, id).toContain(`\`${id}\``);
  });

  it("is at most 60 lines", () => {
    expect(rule.trimEnd().split("\n").length).toBeLessThanOrEqual(60);
  });

  it("sends the reader to the rubric prose and rialto's token rules, both of which exist", () => {
    expect(rule).toContain("docs/ui-quality/rubric.md");
    expect(rule).toContain("packages/rialto/CLAUDE.md");
    expect(existsSync(join(REPO, "docs/ui-quality/rubric.md"))).toBe(true);
  });

  it("is guarded by detect-instruction-rot.mjs", () => {
    expect(FILES_TO_CHECK).toContain(RULE);
  });
});

describe("pointer lines", () => {
  it("packages/rialto/CLAUDE.md § AI Assistant Reference points at the rule", () => {
    const md = read("packages/rialto/CLAUDE.md");
    const section = md.slice(md.indexOf("## AI Assistant Reference"), md.indexOf("## Commands"));
    expect(section).toContain(RULE);
  });

  it(".claude/agents/implement-queue-worker.md step 3 points at the rule", () => {
    const md = read(".claude/agents/implement-queue-worker.md");
    const step3 = md.slice(md.indexOf("3. **TDD implementation**"), md.indexOf("4. **Run gates**"));
    expect(step3).toContain(RULE);
  });
});
