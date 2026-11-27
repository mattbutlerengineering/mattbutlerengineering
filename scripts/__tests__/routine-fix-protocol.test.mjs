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
  "mbe-dev-speed",
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

  it("lets only mbe-dev-speed's workflow-only changes skip the guardrail hold (#10044)", () => {
    const hold = /\*\*Hold these for the Owner\.\*\*([\s\S]*?)\n\n`reviewed-merge\.yml`/.exec(
      protocol
    );
    expect(hold, "hold section").not.toBeNull();
    const exception = /\*\*Exception \(Owner, 2026-11-27, #10044\)\.\*\*([\s\S]*)$/.exec(hold[1]);
    expect(exception, "dev-speed exception paragraph inside the hold section").not.toBeNull();
    const text = exception[1].replace(/\s+/g, " ");
    // Scope: one routine, one path family.
    expect(text).toContain("`mbe-dev-speed`");
    expect(text).toContain("`.github/workflows/**`");
    expect(text).toMatch(/every other routine and every other guardrail path/i);
    // Still held, even for mbe-dev-speed.
    for (const held of [
      "`ci-gate`",
      "`needs`",
      "required-check",
      "`permissions:`",
      "secrets",
      "`pull_request_target`",
      "`workflow_run`",
      "`reviewed-merge.yml`",
      "`merge-queue.yml`",
      "`auto-merge*.yml`",
    ]) {
      expect(text, `exception keeps ${held} held`).toContain(held);
    }
    // The base hold list is unchanged: .github/** is still held by default.
    expect(hold[1]).toContain("`.github/**`");
  });

  it("files an issue only when the cause or the decision is out of reach", () => {
    expect(protocol).toMatch(/File an issue only when/);
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
