/**
 * Pins the one shape of merge call that cloud routines and local auto-mode
 * sessions can issue without the auto-mode classifier denying it as
 * `[Merge Without Review]` (#6125).
 *
 * Auto mode resolves a narrow `permissions.allow` Bash rule before the
 * classifier runs, and a single-repository cloud session reads the repo's
 * `.claude/settings.json`. A compound command (`&&`, `;`, `|`, a leading
 * `R=…` assignment, a `$R/pulls` or `.../pulls` placeholder) does not match
 * the rule and falls through to the classifier, which blocks "merging a pull
 * request no human has approved". So the rule, the routine prompts and the
 * local merge paths have to agree on one literal form; this test keeps them
 * from drifting apart, the same way routine-liveness.test.mjs pins each
 * prompt's heartbeat line.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

/** The exact allow rule `.claude/settings.json` must carry. */
export const MERGE_ALLOW_RULE =
  "Bash(gh api -X PUT repos/mattbutlerengineering/mattbutlerengineering/pulls/*)";

/** The literal merge call every cloud routine prompt must spell out. */
const LITERAL_MERGE_CALL =
  /gh api -X PUT repos\/mattbutlerengineering\/mattbutlerengineering\/pulls\/<(N|PR)>\/merge --input/;

/** Routines whose prompt merges PRs from a Claude Code Remote session. */
const CLOUD_MERGING_ROUTINES = ["mbe-feature-drain", "mbe-prune", "mbe-daily-issue"];

/** Local (non-CCR) merge paths, which use `gh pr merge` under `Bash(gh pr *)`. */
const LOCAL_MERGE_PATHS = [".claude/implement-queue.md", ".claude/skills/ship-pr/SKILL.md"];

function promptOf(name) {
  const doc = read(`docs/routines/${name}.md`);
  const fence = /```text\n([\s\S]*?)\n```/.exec(doc);
  if (!fence) throw new Error(`docs/routines/${name}.md has no \`\`\`text prompt block`);
  return fence[1];
}

function allowRules() {
  const settings = JSON.parse(read(".claude/settings.json"));
  return settings.permissions?.allow ?? [];
}

describe("merge allow rule (#6125)", () => {
  it(".claude/settings.json allows the plain REST merge call", () => {
    expect(allowRules()).toContain(MERGE_ALLOW_RULE);
  });

  it("the rule is narrow: PUT on this repository's pulls only, one trailing wildcard", () => {
    // Loosening this to `Bash(gh api *)` would approve every write to the
    // GitHub API without classifier review. The prefix must name the method
    // and the repository, and the only `*` must be the trailing one.
    expect(
      MERGE_ALLOW_RULE.startsWith(
        "Bash(gh api -X PUT repos/mattbutlerengineering/mattbutlerengineering/pulls/"
      )
    ).toBe(true);
    expect(MERGE_ALLOW_RULE.indexOf("*")).toBe(MERGE_ALLOW_RULE.length - 2);
  });

  it("local merge paths keep `gh pr merge`, which `Bash(gh pr *)` already allows", () => {
    expect(allowRules()).toContain("Bash(gh pr *)");
    for (const rel of LOCAL_MERGE_PATHS) {
      expect(read(rel), rel).toContain("gh pr merge <N> --auto --squash --delete-branch");
      expect(read(rel), rel).toMatch(/whole Bash call/);
    }
  });

  describe.each(CLOUD_MERGING_ROUTINES)("%s", (name) => {
    const prompt = promptOf(name);

    it("spells the merge call in the literal form the allow rule matches", () => {
      expect(prompt).toMatch(LITERAL_MERGE_CALL);
    });

    it("never abbreviates the repository path or uses a shell variable on the merge line", () => {
      const mergeLines = prompt.split("\n").filter((line) => /pulls\/<(N|PR)>\/merge/.test(line));
      expect(mergeLines.length).toBeGreaterThan(0);
      for (const line of mergeLines) {
        expect(line).not.toMatch(/\$R\/pulls|\.\.\.\/pulls/);
      }
    });

    it("tells the session the call must stand alone and why", () => {
      expect(prompt).toMatch(/whole Bash call/);
      expect(prompt).toMatch(/\.claude\/settings\.json/);
    });

    it("never merges through the GraphQL-backed `gh pr merge`, which answers 403 in CCR", () => {
      expect(prompt).not.toMatch(/Green: merge with `gh pr merge/);
    });
  });
});
