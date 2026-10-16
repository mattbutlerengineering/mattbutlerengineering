/**
 * #6779: `.cursorrules` is `mbe sync-rules` output (header + AGENTS.md verbatim)
 * but nothing ran it or checked it, so Cursor kept reading a long-stale copy.
 * See scripts/check-cursorrules-drift.mjs.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expectedCursorRules, findCursorRulesDrift } from "../check-cursorrules-drift.mjs";
import { REPO_AUDIT_CHECKS } from "../run-repo-audit.mjs";

const roots = [];

function makeFixture({ agents, cursorrules }) {
  const root = mkdtempSync(join(tmpdir(), "cursorrules-drift-"));
  roots.push(root);
  if (agents !== undefined) writeFileSync(join(root, "AGENTS.md"), agents);
  if (cursorrules !== undefined) writeFileSync(join(root, ".cursorrules"), cursorrules);
  return root;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("check-cursorrules-drift (#6779)", () => {
  it("builds the same bytes `mbe sync-rules` writes", () => {
    expect(expectedCursorRules("# AGENTS\nbody\n")).toBe(
      "<!-- @mbe-managed - DO NOT EDIT MANUALLY -->\n# Cursor Rules - mattbutlerengineering\n\n# AGENTS\nbody\n"
    );
  });

  it("reports nothing when .cursorrules is header + AGENTS.md", () => {
    const agents = "# AGENTS\nline\n";
    const root = makeFixture({ agents, cursorrules: expectedCursorRules(agents) });
    expect(findCursorRulesDrift(root)).toEqual([]);
  });

  it("fails on a one-line divergence", () => {
    const agents = "# AGENTS\nline one\nline two\n";
    const stale = expectedCursorRules(agents).replace("line two", "line 2");
    const root = makeFixture({ agents, cursorrules: stale });
    expect(findCursorRulesDrift(root)).toEqual([".cursorrules"]);
  });

  it("fails when .cursorrules is missing", () => {
    const root = makeFixture({ agents: "# AGENTS\n" });
    expect(findCursorRulesDrift(root)).toEqual([".cursorrules"]);
  });

  it("passes on the real repo", () => {
    expect(findCursorRulesDrift()).toEqual([]);
  });

  it("is wired into repo-audit", () => {
    expect(REPO_AUDIT_CHECKS.map((c) => c.name)).toContain("check-cursorrules-drift");
  });
});
