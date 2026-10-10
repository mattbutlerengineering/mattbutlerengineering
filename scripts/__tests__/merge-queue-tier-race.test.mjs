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

  it("race: has-pr lands first (skip), a blocking tier arriving while enabled -> disable", () => {
    expect(decideAutoMergeAction(["has-pr"], false).action).toBe("skip");
    // auto-merge enabled via another path; the tier label lands afterwards
    for (const tier of BLOCKED_TIER_LABELS) {
      const second = decideAutoMergeAction(["has-pr", tier], true);
      expect(second.action).toBe("disable");
      expect(second.reason).toContain(tier);
    }
  });

  it("skips (no disable call) when blocked and auto-merge is not enabled", () => {
    expect(decideAutoMergeAction(["has-pr", "tier:critical"], false).action).toBe("skip");
  });

  it("disables stale auto-merge when needs-review appears", () => {
    expect(decideAutoMergeAction(["has-pr", "needs-review"], true).action).toBe("disable");
  });

  it("CLI emits the action when --auto-merge-enabled is passed", () => {
    const stdout = execFileSync(
      "node",
      [CLI, "check", "--labels", "has-pr,tier:standard", "--auto-merge-enabled", "true"],
      { encoding: "utf8" }
    );
    expect(JSON.parse(stdout).action).toBe("disable");
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
