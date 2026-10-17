/**
 * Structural guard for .github/workflows/shipped-features-snapshot.yml
 * (#6904, feature shipped-stories).
 *
 * The marketing site never calls GitHub at runtime; the snapshot it renders is
 * regenerated weekly by this workflow and lands through the automation-PR path
 * (a bare push to protected `main` is rejected with GH006). Mirrors
 * metrics-collectors-workflow.test.mjs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/shipped-features-snapshot.yml");
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");
const SNAPSHOT = "apps/marketing/src/data/shipped-features.json";

const wf = loadWorkflow(WORKFLOW_PATH);
const job = getJob(wf, "snapshot");
const GATE = "steps.create-pr.outputs.pull-request-number";

describe("shipped-features-snapshot triggers", () => {
  it("runs on a weekly schedule", () => {
    expect(WORKFLOW).toMatch(/schedule:/);
    const crons = [...WORKFLOW.matchAll(/cron: "([^"]+)"/g)].map((m) => m[1]);
    expect(crons).toHaveLength(1);
    // minute hour dom month dow — weekly means a fixed day of week
    const [minute, hour, dom, month, dow] = crons[0].split(" ");
    expect(dom).toBe("*");
    expect(month).toBe("*");
    expect(dow).toMatch(/^[0-6]$/);
    // off-minute and off-hour, away from the on-the-hour fleet
    expect(minute).not.toBe("0");
    expect(minute).not.toBe("30");
    expect(hour).not.toBe("0");
  });

  it("accepts workflow_dispatch", () => {
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it("does not collide with another workflow's cron", () => {
    const cronOf = (text) => [...text.matchAll(/cron: "([^"]+)"/g)].map((m) => m[1]);
    const ours = cronOf(WORKFLOW);
    const dir = join(ROOT, ".github", "workflows");
    const others = readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f) && f !== "shipped-features-snapshot.yml")
      .flatMap((f) => cronOf(readFileSync(join(dir, f), "utf8")));
    for (const cron of ours) expect(others).not.toContain(cron);
  });
});

describe("shipped-features-snapshot permissions and concurrency", () => {
  it("declares a concurrency group", () => {
    expect(WORKFLOW).toMatch(/^concurrency:\n\s+group:/m);
  });

  it("holds the minimal permissions the PR path needs", () => {
    expect(wf.permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
      actions: "write",
    });
  });
});

describe("shipped-features-snapshot collector step", () => {
  it("runs the collector with a GITHUB_TOKEN", () => {
    const step = job.steps.find((s) =>
      (s.run ?? "").includes("node scripts/collect-shipped-features.mjs")
    );
    expect(step, "collector step").toBeTruthy();
    expect(step.env.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
  });

  it("is the only step that touches GitHub data for the snapshot", () => {
    // The site reads the committed file; nothing in this workflow edits it by hand.
    const writers = job.steps.filter((s) => (s.run ?? "").includes(SNAPSHOT));
    expect(writers).toHaveLength(0);
  });
});

describe("shipped-features-snapshot PR path", () => {
  it("adds exactly the snapshot, with the auto-merge label, on its own branch", () => {
    const step = getStep(job, "Open PR with shipped-features snapshot");
    expect(step.uses).toMatch(/^peter-evans\/create-pull-request@[0-9a-f]{40}/);
    expect(step.id).toBe("create-pr");
    expect(step.env.HUSKY).toBe("0");
    expect(step.with["branch"]).toBe("automation/shipped-features");
    expect(step.with["add-paths"].trim()).toBe(SNAPSHOT);
    expect(step.with.labels).toBe("auto-merge");
  });

  it("dispatches ci.yml and tier-classifier.yml on the automation branch", () => {
    const ci = getStep(job, "Dispatch CI on the automation branch");
    expect(ci.run).toMatch(/gh workflow run ci\.yml --ref automation\/shipped-features/);
    expect(ci.if).toContain(GATE);

    const tier = getStep(job, "Dispatch tier-classifier on the automation branch");
    expect(tier.run).toMatch(
      /gh workflow run tier-classifier\.yml --ref automation\/shipped-features/
    );
    expect(tier.if).toContain(GATE);
  });

  it("approves runs and waits for the tier label, both gated on a PR existing", () => {
    const approve = getStep(job, "Approve pending automation workflow runs");
    expect(approve.run).toMatch(/scripts\/approve-automation-runs\.mjs approve/);
    expect(approve.if).toContain(GATE);

    const wait = getStep(job, "Wait for tier-classifier label");
    expect(wait.run).toMatch(/scripts\/wait-for-tier-label\.mjs/);
    expect(wait.if).toContain(GATE);
  });

  it("enables auto-merge only through the eligibility gate, never bare", () => {
    const step = getStep(job, "Enable auto-merge");
    expect(step.if).toContain(GATE);
    expect(step.run).toMatch(/scripts\/merge-queue-eligibility\.mjs check-merge/);
    expect(step.run).toMatch(/set -o pipefail/);
    const bare = job.steps.filter(
      (s) =>
        /gh pr merge/.test(s.run ?? "") && !/merge-queue-eligibility\.mjs check-merge/.test(s.run)
    );
    expect(bare).toHaveLength(0);
  });

  it("orders collect -> PR -> dispatch -> approve -> wait -> auto-merge", () => {
    const names = job.steps.map((s) => s.name);
    const order = [
      "Collect shipped-features snapshot",
      "Open PR with shipped-features snapshot",
      "Dispatch CI on the automation branch",
      "Dispatch tier-classifier on the automation branch",
      "Approve pending automation workflow runs",
      "Wait for tier-classifier label",
      "Enable auto-merge",
    ].map((n) => names.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("sets pipefail on every run block that pipes", () => {
    for (const s of job.steps.filter((x) => /\|\s*(tee|grep|head|jq)\b/.test(x.run ?? ""))) {
      expect(s.run).toMatch(/set -o pipefail/);
    }
  });
});
