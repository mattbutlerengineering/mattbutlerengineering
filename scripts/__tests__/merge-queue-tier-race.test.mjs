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
  it("enables when eligible and nothing blocks", () => {
    expect(decideAutoMergeAction(["has-pr"], false).action).toBe("enable");
  });

  it("race: has-pr lands first (enable), then a blocking tier arrives -> disable", () => {
    expect(decideAutoMergeAction(["has-pr"], false).action).toBe("enable");
    // auto-merge is now enabled on GitHub; the tier label lands afterwards
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
    expect(WORKFLOW).toMatch(/run: \|\n\s+set -o pipefail/);
  });
});
