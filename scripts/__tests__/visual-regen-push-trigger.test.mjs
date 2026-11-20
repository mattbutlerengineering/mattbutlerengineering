/**
 * Guards for the push-to-main arm of .github/workflows/visual-regen-trigger.yml
 * (#8781): a merge that changes marketing content (which moves page heights)
 * dispatches visual-baseline-regen.yml for `marketing` straight away, instead
 * of waiting for Apps Visual Regression to go red on main.
 *
 * What must stay true: it only DISPATCHES (never merges, never writes
 * contents), it cannot loop on the regen PR's own PNG-only merge, and it
 * stays out of the `measure/**` / `visual-diffs/**` ref namespaces.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkflow } from "../lib/workflow.mjs";
import { extractRunBlocks } from "../check-pipe-to-shell-pipefail.mjs";
import { MAIN_PUSH_WORKFLOW_FILES } from "../scheduled-workflow-health.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const FILE = "visual-regen-trigger.yml";
const SOURCE = readFileSync(resolve(ROOT, ".github/workflows", FILE), "utf8");
const WORKFLOW = parseWorkflow(SOURCE);
const PUSH = WORKFLOW.on.push;

/** GitHub `paths:` glob -> RegExp (`*` stops at `/`, `**` crosses it). */
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
    } else if (glob[i] === "*") out += "[^/]*";
    else out += glob[i].replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** GitHub semantics: a path fires if it matches a positive glob and the last matching glob is not a negation. */
function pathFires(patterns, path) {
  let fires = false;
  for (const p of patterns) {
    const negated = p.startsWith("!");
    if (globToRegExp(negated ? p.slice(1) : p).test(path)) fires = !negated;
  }
  return fires;
}

describe("visual-regen-trigger.yml push arm", () => {
  it("fires on push to main only", () => {
    expect(PUSH).toBeTruthy();
    expect(PUSH.branches).toEqual(["main"]);
  });

  it.each([
    "apps/marketing/src/pages/home.tsx",
    "apps/marketing/src/data/shipped-features.json",
    "apps/marketing/src/data/repo-stats.fallback.json",
    "apps/marketing/public/metrics.json",
    "apps/marketing/public/sensor-report.json",
  ])("fires for %s", (path) => {
    expect(pathFires(PUSH.paths, path)).toBe(true);
  });

  it.each([
    "apps/marketing/e2e/screenshots/visual-home-1280x720-linux.png",
    "apps/marketing/e2e/screenshots/nested/x.png",
    "apps/hospitality/src/App.tsx",
    "docs/readme.md",
  ])("does NOT fire for %s (loop guard / out of scope)", (path) => {
    expect(pathFires(PUSH.paths, path)).toBe(false);
  });

  it("has a push-only dispatch job that targets marketing, never grep-scoped", () => {
    const job = WORKFLOW.jobs["push-dispatch"];
    expect(job).toBeTruthy();
    expect(job.if).toContain("github.event_name == 'push'");
    const block = extractRunBlocks(SOURCE).find((b) =>
      b.body.includes("visual-baseline-regen.yml")
    );
    // the first match is the workflow_run dispatch job; find the push one explicitly
    const pushBlock = extractRunBlocks(SOURCE).find(
      (b) => b.body.includes("visual-baseline-regen.yml") && b.body.includes("app=marketing")
    );
    expect(block).toBeTruthy();
    expect(pushBlock).toBeTruthy();
    expect(pushBlock.body).toContain("set -o pipefail");
  });

  it("the workflow_run derive job cannot run on a push event", () => {
    expect(WORKFLOW.jobs.derive.if).toContain("github.event_name == 'workflow_run'");
  });

  it("grants only actions: write beyond read (no contents: write anywhere)", () => {
    expect(SOURCE).not.toMatch(/contents:\s*write/);
    expect(WORKFLOW.jobs["push-dispatch"].permissions).toEqual({ actions: "write" });
  });

  it("never merges", () => {
    expect(SOURCE).not.toMatch(/gh pr merge|--auto|--squash/);
  });

  it("is watched by the main-push health detector, so failed dispatches are not silent", () => {
    expect(MAIN_PUSH_WORKFLOW_FILES).toContain(FILE);
  });
});
