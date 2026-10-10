import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decideAutoMergeAction, BLOCKED_TIER_LABELS } from "../merge-queue-eligibility.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = resolve(ROOT, "scripts/merge-queue-eligibility.mjs");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/merge-queue.yml"), "utf8");

describe("tier-label race (#5983)", () => {
  it("fails closed: has-pr with no tier label is skip, never enable", () => {
    const d = decideAutoMergeAction(["has-pr"], false);
    expect(d.action).toBe("skip");
    expect(d.reason).toMatch(/awaiting tier classification/);
  });

  it("enables has-pr + tier:trivial", () => {
    expect(decideAutoMergeAction(["has-pr", "tier:trivial"], false).action).toBe("enable");
  });

  it("never enables on a blocking tier, even with has-pr", () => {
    for (const tier of BLOCKED_TIER_LABELS) {
      expect(decideAutoMergeAction(["has-pr", tier], false).action).toBe("skip");
    }
  });

  // Regression (2026-10-10): disabling on any ineligible PR switched off the
  // auto-merge /implement-queue arms on reviewed PRs — worker PRs carry no
  // `has-pr` label (their issues do) and tier never holds a reviewed PR
  // (implement-queue SKILL.md "No tier hold"). Because enable now fails
  // closed until a tier label exists, this workflow never arms auto-merge
  // early, so a blocking tier or a missing has-pr is never a reason to
  // undo someone else's enable.
  it("never disables an auto-merge armed elsewhere for a blocking tier or a missing has-pr", () => {
    for (const labels of [
      ["agent-authored", "tier:standard"],
      ["agent-authored", "tier:trivial"],
      ["agent-authored"],
      ...BLOCKED_TIER_LABELS.map((tier) => ["has-pr", tier]),
    ]) {
      expect(decideAutoMergeAction(labels, true).action).toBe("skip");
    }
  });

  it("disables stale auto-merge when needs-review appears (an explicit human hold)", () => {
    expect(decideAutoMergeAction(["has-pr", "needs-review"], true).action).toBe("disable");
    expect(
      decideAutoMergeAction(["agent-authored", "tier:standard", "needs-review"], true).action
    ).toBe("disable");
  });

  it("skips (no disable call) when held and auto-merge is not enabled", () => {
    expect(decideAutoMergeAction(["has-pr", "needs-review"], false).action).toBe("skip");
  });

  it("CLI emits the action when --auto-merge-enabled is passed", () => {
    const run = (labels) =>
      JSON.parse(
        execFileSync("node", [CLI, "check", "--labels", labels, "--auto-merge-enabled", "true"], {
          encoding: "utf8",
        })
      ).action;
    expect(run("has-pr,tier:standard")).toBe("skip");
    expect(run("has-pr,needs-review")).toBe("disable");
  });

  it("seam: workflow reads autoMergeRequest, passes it in, and calls --disable-auto", () => {
    expect(WORKFLOW).toMatch(/autoMergeRequest/);
    expect(WORKFLOW).toMatch(/--auto-merge-enabled/);
    expect(WORKFLOW).toMatch(/gh pr merge "\$pr" --disable-auto/);
  });

  it("seam: workflow run block starts with pipefail", () => {
    const stepAt = WORKFLOW.indexOf("- name: Enable auto-merge for verified agent PRs");
    expect(stepAt).toBeGreaterThan(-1);
    const step = WORKFLOW.slice(stepAt);
    expect(step).toMatch(/run: \|\n\s+set -o pipefail/);
  });
});
