/**
 * Structural guard for .github/workflows/metrics-collectors.yml (#5528).
 *
 * The workflow exists because both collectors it runs were only ever invoked
 * from a Claude Code Remote cloud session, which has neither production
 * egress nor the `gh` CLI. Actions runners have both. That fix is only real
 * if the workflow keeps running BOTH collectors, keeps committing what they
 * produce, and keeps reporting honestly when they produce nothing — so those
 * three properties are asserted here rather than left to a reader's memory.
 *
 * Deliberately a text-level check on the real workflow file, matching the
 * house style (see auto-qa-tune-workflow.test.mjs, ci-node-matrix.test.mjs).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/metrics-collectors.yml");
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");

describe("metrics-collectors workflow triggers", () => {
  it("runs on a schedule — an on-demand-only workflow is the status quo it replaces", () => {
    expect(WORKFLOW).toMatch(/^on:/m);
    expect(WORKFLOW).toMatch(/schedule:/);
    expect(WORKFLOW).toMatch(/cron: "[^"]+"/);
  });

  it("also accepts workflow_dispatch, so a human can prove it runs without waiting a day", () => {
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it("does not collide with an existing cron in the scheduled fleet", () => {
    const cronOf = (text) => [...text.matchAll(/cron: "([^"]+)"/g)].map((m) => m[1]);
    const ours = cronOf(WORKFLOW);
    expect(ours.length).toBeGreaterThan(0);

    const workflowsDir = join(ROOT, ".github", "workflows");
    const others = readdirSync(workflowsDir)
      .filter((f) => (f.endsWith(".yml") || f.endsWith(".yaml")) && f !== "metrics-collectors.yml")
      .flatMap((f) => cronOf(readFileSync(join(workflowsDir, f), "utf8")));

    for (const cron of ours) {
      expect(others, `${cron} is already taken by another workflow`).not.toContain(cron);
    }
  });
});

describe("metrics-collectors workflow runs both dead collectors", () => {
  it("runs the booking-funnel collector", () => {
    expect(WORKFLOW).toMatch(/node scripts\/collect-domain-metrics\.mjs/);
  });

  it("runs the review-burden collector", () => {
    expect(WORKFLOW).toMatch(/node scripts\/acmm\/review-burden-metrics\.js/);
  });

  it("passes the domain-metrics credentials through from repo secrets", () => {
    // The secret does not exist yet — a human has to add it (#5527). Wiring
    // it now means the workflow starts producing rows the moment it does,
    // with no follow-up code change.
    expect(WORKFLOW).toMatch(
      /DOMAIN_METRICS_VENUE_ID: \$\{\{ secrets\.DOMAIN_METRICS_VENUE_ID \}\}/
    );
    expect(WORKFLOW).toMatch(/DOMAIN_METRICS_API_BASE_URL/);
    expect(WORKFLOW).toMatch(/DOMAIN_METRICS_TOKEN/);
  });

  it("gives the review-burden collector a token for the `gh` calls it shells out to", () => {
    expect(WORKFLOW).toMatch(/GH_TOKEN/);
    expect(WORKFLOW).toMatch(/pull-requests:\s*(read|write)/);
  });
});

describe("metrics-collectors workflow persists what it collected", () => {
  it("commits both metrics files back through a PR", () => {
    expect(WORKFLOW).toMatch(/peter-evans\/create-pull-request/);
    expect(WORKFLOW).toMatch(/metrics\/domain-metrics\.jsonl/);
    expect(WORKFLOW).toMatch(/metrics\/review-burden\.json/);
  });

  it("dispatches CI on its own branch, or the PR can never become mergeable", () => {
    // GITHUB_TOKEN-authored PRs do not fire `pull_request` workflows, so the
    // required CI Gate check never appears. scripts/check-ci-dispatch.mjs
    // enforces this repo-wide; asserted here too so the reason is local.
    expect(WORKFLOW).toMatch(/gh workflow run ci\.yml --ref/);
    expect(WORKFLOW).toMatch(/actions:\s*write/);
  });
});

describe("metrics-collectors workflow self-check is not decorative", () => {
  it("runs the freshness check", () => {
    expect(WORKFLOW).toMatch(/node scripts\/metrics-freshness\.mjs/);
  });

  it("runs the freshness check AFTER both collectors, so it grades this run", () => {
    const domainAt = WORKFLOW.indexOf("node scripts/collect-domain-metrics.mjs");
    const burdenAt = WORKFLOW.indexOf("node scripts/acmm/review-burden-metrics.js");
    const freshnessAt = WORKFLOW.indexOf("node scripts/metrics-freshness.mjs");

    expect(freshnessAt).toBeGreaterThan(domainAt);
    expect(freshnessAt).toBeGreaterThan(burdenAt);
  });

  it("sets pipefail on every run block that pipes, or the exit code is lost", () => {
    // GitHub's default shell is `bash -e` with NO pipefail, so
    // `node check.mjs | tee out` exits with tee's status — always 0 — and a
    // failing gate goes green. Any run: block containing a pipe must opt in.
    const runBlocks = WORKFLOW.split(/^\s+- name: /m).filter((block) =>
      /\|\s*(tee|grep|head|jq)\b/.test(block)
    );
    expect(runBlocks.length, "expected at least one piping run block to guard").toBeGreaterThan(0);
    for (const block of runBlocks) {
      expect(block, `piping block without pipefail:\n${block.slice(0, 200)}`).toMatch(
        /set -o pipefail/
      );
    }
  });

  it("never swallows an exit code with `|| true` or continue-on-error", () => {
    expect(WORKFLOW).not.toMatch(/\|\|\s*true/);
    expect(WORKFLOW).not.toMatch(/continue-on-error:\s*true/);
  });

  it("acts on a non-zero freshness verdict instead of only printing it", () => {
    // Printing a verdict nobody reads is the decorative-gate failure mode.
    // The verdict has to reach a durable, deduped issue.
    expect(WORKFLOW).toMatch(/scripts\/lib\/file-issue-cli\.mjs/);
    expect(WORKFLOW).toMatch(/--dedupe-key/);
  });

  it("files the staleness issue WITHOUT the `ready` label", () => {
    // The most likely cause is a missing production secret only a human can
    // supply (#5527). A `ready` label would feed an unfixable issue to
    // implement-queue, where an agent burns a budget failing to fix it.
    const issueStep = WORKFLOW.slice(WORKFLOW.indexOf("file-issue-cli.mjs"));
    expect(issueStep).not.toMatch(/--label "?ready"?/);
    expect(issueStep).toMatch(/--label/);
  });
});
