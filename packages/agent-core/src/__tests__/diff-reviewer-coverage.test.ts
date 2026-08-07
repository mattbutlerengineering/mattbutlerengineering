/**
 * Coverage guard: every specialist reviewer agent declared in
 * `.claude/agents/*.md` must have a matching entry in `pr-risk-classifier.ts`'s
 * `DIFF_REVIEWERS` table, or be on this test's explicit allowlist.
 *
 * `e2e-selector-drift-reviewer` shipped as a fully-documented agent (frontmatter,
 * CLAUDE.md subagent table, a precise trigger) but `reviewersForDiff` never
 * dispatched it — the router simply had no entry for it. That gap was only
 * caught because a human manually cross-referenced CLAUDE.md against the
 * changed files during a live implement-queue gating run (#3916). This test
 * makes that gap a build-time failure instead of a live-run near-miss, and
 * generalizes to the next specialist agent somebody writes.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIFF_REVIEWER_NAMES } from "../pr-risk-classifier.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");

/**
 * Agent types that are intentionally NOT diff-matched specialists:
 * - `reviewer` — the universal quality gate, dispatched unconditionally at
 *   the worker→train boundary, not routed by changed-file pattern.
 * - `implement-queue-worker` — a worker, not a reviewer; it implements
 *   issues, it doesn't review diffs.
 */
const ALLOWLIST: ReadonlySet<string> = new Set(["reviewer", "implement-queue-worker"]);

/** Extracts the `name:` field from a markdown file's YAML frontmatter block. */
function frontmatterName(markdown: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!block) {
    return null;
  }

  const nameLine = block[1].split(/\r?\n/).find((line) => line.startsWith("name:"));
  return nameLine ? nameLine.slice("name:".length).trim() : null;
}

function declaredAgentNames(): readonly string[] {
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".md"))
    .flatMap((file) => {
      const name = frontmatterName(readFileSync(join(AGENTS_DIR, file), "utf-8"));
      return name === null ? [] : [name];
    });
}

describe("DIFF_REVIEWERS coverage of .claude/agents/*.md", () => {
  it("has a DIFF_REVIEWERS entry (or allowlist exemption) for every agent file", () => {
    const uncovered = declaredAgentNames().filter(
      (name) => !ALLOWLIST.has(name) && !DIFF_REVIEWER_NAMES.includes(name)
    );

    expect(
      uncovered,
      `${uncovered.join(", ")} declared in .claude/agents/*.md but missing from ` +
        `DIFF_REVIEWERS in packages/agent-core/src/pr-risk-classifier.ts — add a matching ` +
        `entry there, or add the name to this test's ALLOWLIST if it is not a diff-matched ` +
        `specialist (e.g. the universal reviewer gate or a worker agent).`
    ).toEqual([]);
  });
});
