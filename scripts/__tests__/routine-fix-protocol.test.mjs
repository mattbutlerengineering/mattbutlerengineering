/**
 * Pins the "fix it, don't ticket it" protocol (#9947). Routines that find a
 * problem they can root-cause must fix it in a reviewed PR handed to
 * reviewed-merge.yml, and file an issue only when they cannot.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVerdict } from "../reviewed-merge.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const PROTOCOL = "docs/routines/fix-protocol.md";
const SHA = "0123456789abcdef0123456789abcdef01234567";

/** Routines that used to end in a ticket and now follow the protocol. */
const FIXING_ROUTINES = [
  "mbe-auditor",
  "mbe-learning-loop",
  "mbe-evening",
  "mbe-weekly-improve",
  "mbe-weekly-retro",
  "mbe-monthly-meta-audit",
  "mbe-doc-rot",
  "mbe-ui-quality",
  "mbe-dev-speed",
  "mbe-hourly-fix",
];

const promptOf = (name) => {
  const fence = /```text\n([\s\S]*?)\n```/.exec(read(`docs/routines/${name}.md`));
  if (!fence) throw new Error(`docs/routines/${name}.md has no \`\`\`text prompt block`);
  return fence[1];
};

describe("fix protocol (#9947)", () => {
  const protocol = read(PROTOCOL);

  it("hands a passing fix to reviewed-merge.yml with a verdict the workflow parses", () => {
    const template = /`(reviewed-merge: <[^`]*> PASS <score>\/10)`/.exec(protocol);
    expect(template, "verdict template").not.toBeNull();
    const filled = template[1].replace(/<[^>]*SHA[^>]*>/, SHA).replace("<score>", "8");
    expect(parseVerdict(filled)).toMatchObject({ sha: SHA, score: 8, fastPath: false });
    expect(protocol).toContain("`reviewed` label");
  });

  it("records the reviewer verdict the queueEfficiency sensor counts", () => {
    expect(protocol).toContain("reviewer-verdict: <pass|flag> (score <N>, threshold 7)");
  });

  it("never merges from the session and holds security fixes for the Owner", () => {
    expect(protocol).toMatch(/Never call the merge endpoint/);
    expect(protocol).not.toContain("gh pr merge");
    const hold = /\*\*Hold these for the Owner\.\*\*([\s\S]*?)\n\n`reviewed-merge\.yml`/.exec(
      protocol
    );
    expect(hold, "hold section").not.toBeNull();
    expect(hold[1]).toContain("`needs-review`");
    expect(hold[1]).toMatch(/security/);
    for (const path of [".github/**", ".claude/**", "scripts/reviewed-merge.mjs", "CLAUDE.md"]) {
      expect(hold[1]).toContain(path);
    }
  });

  it("files an issue only when the cause or the decision is out of reach", () => {
    expect(protocol).toMatch(/File an issue only when/);
  });

  it("re-checks open and merged PRs by touched path right before opening the PR (#10195)", () => {
    const fix = /## 2\. Fix it([\s\S]*?)\n## 3\./.exec(protocol);
    expect(fix, "section 2").not.toBeNull();
    expect(fix[1]).toMatch(/Immediately before you open the pull request/);
    expect(fix[1]).toContain("git diff --name-only origin/main...HEAD");
    expect(fix[1]).toContain("pulls?state=open");
    expect(fix[1]).toContain("pulls?state=closed&sort=updated&direction=desc");
    expect(fix[1]).toContain("pulls/<N>/files");
    expect(fix[1]).toMatch(/not on issue numbers or titles/);
    expect(fix[1]).toMatch(/already landed/);
    expect(fix[1]).toMatch(/comments-only/);
  });

  it("never pushes a review-driven fix to a PR that has closed or merged (#10184)", () => {
    const review = /## 3\. Review, then hand off([\s\S]*?)\n## 4\./.exec(protocol);
    expect(review, "section 3").not.toBeNull();
    expect(review[1]).toMatch(/confirm the PR is still open/);
    expect(review[1]).toContain("pulls/<N>' --jq");
    expect(review[1]).toContain("`open false`");
    expect(review[1]).toContain(".head.sha");
    expect(review[1]).toMatch(/follow-up pull request/);
    // Captured verbatim from the push that lost e9c6431 (#10184): a push to a
    // deleted branch succeeds and reads exactly like a first push.
    expect(review[1]).toContain("`* [new branch]`");
    expect(review[1]).toContain("git merge-base --is-ancestor");
    expect(review[1]).toContain("origin/main");
  });

  it("gives routines no GraphQL-backed gh call, which answers 403 in cloud sessions", () => {
    expect(protocol).not.toMatch(/gh (pr|issue) (list|view)/);
  });

  it.each(FIXING_ROUTINES)("%s's prompt points at the protocol", (name) => {
    expect(promptOf(name)).toContain(PROTOCOL);
  });

  it("mbe-auditor is no longer read-only", () => {
    const prompt = promptOf("mbe-auditor");
    expect(prompt).not.toMatch(/READ-ONLY/);
    expect(prompt).not.toMatch(/Never commit, push, or open PRs/);
  });
});
