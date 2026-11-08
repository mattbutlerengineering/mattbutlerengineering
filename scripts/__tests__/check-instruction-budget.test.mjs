import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { BUDGET_BYTES, findBudgetViolations } from "../check-instruction-budget.mjs";

/** A throwaway git repo holding CLAUDE.md and .claude/rules/gotchas.md of the given sizes. */
function fixture({ claude, gotchas, extraRule }) {
  const root = mkdtempSync(join(tmpdir(), "instr-budget-"));
  mkdirSync(join(root, ".claude/rules"), { recursive: true });
  writeFileSync(join(root, "CLAUDE.md"), "x".repeat(claude));
  writeFileSync(join(root, ".claude/rules/gotchas.md"), "x".repeat(gotchas));
  if (extraRule) writeFileSync(join(root, ".claude/rules/extra.md"), "# always loaded\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

describe("findBudgetViolations (docs-lane instruction budget, #8396)", () => {
  it("budgets CLAUDE.md and gotchas.md", () => {
    expect(BUDGET_BYTES).toEqual({ "CLAUDE.md": 9_000, ".claude/rules/gotchas.md": 22_000 });
  });

  it("passes when both files are within budget", () => {
    const root = fixture({ claude: 9_000, gotchas: 22_000 });
    expect(findBudgetViolations(root)).toEqual([]);
  });

  it("fails when gotchas.md is one byte over", () => {
    const root = fixture({ claude: 100, gotchas: 22_001 });
    expect(findBudgetViolations(root)).toEqual([
      expect.stringContaining(".claude/rules/gotchas.md"),
    ]);
  });

  it("fails when CLAUDE.md is one byte over", () => {
    const root = fixture({ claude: 9_001, gotchas: 100 });
    expect(findBudgetViolations(root)).toEqual([expect.stringContaining("CLAUDE.md")]);
  });

  it("fails on an always-loaded rules file with no budget", () => {
    const root = fixture({ claude: 100, gotchas: 100, extraRule: true });
    expect(findBudgetViolations(root)).toEqual([expect.stringContaining(".claude/rules/extra.md")]);
  });

  it("fails closed when a budgeted file is missing", () => {
    const root = fixture({ claude: 100, gotchas: 100 });
    execFileSync("git", ["rm", "-q", "-f", "CLAUDE.md"], { cwd: root });
    expect(findBudgetViolations(root)).toEqual([expect.stringContaining("CLAUDE.md")]);
  });
});
