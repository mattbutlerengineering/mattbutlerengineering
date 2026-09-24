/**
 * Structural guard for .github/workflows/metrics-collectors.yml (#5528).
 *
 * The workflow originally ran two collectors that were only ever invoked
 * from a Claude Code Remote cloud session, which has neither production
 * egress nor the `gh` CLI. Actions runners have both. The booking-funnel
 * domain-metrics collector was retired in #5561 — it needed a production
 * venue id and auth token nobody would provision, so it never produced a
 * row. Only the review-burden collector remains, and that fix is only real
 * if the workflow keeps running it, keeps committing what it produces, and
 * keeps reporting honestly when it produces nothing — so those properties
 * are asserted here rather than left to a reader's memory, alongside an
 * explicit pin that the retired collector stays gone.
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

describe("metrics-collectors workflow runs the review-burden collector", () => {
  it("runs the review-burden collector", () => {
    expect(WORKFLOW).toMatch(/node scripts\/acmm\/review-burden-metrics\.js/);
  });

  it("gives the review-burden collector a token for the `gh` calls it shells out to", () => {
    expect(WORKFLOW).toMatch(/GH_TOKEN/);
    expect(WORKFLOW).toMatch(/pull-requests:\s*(read|write)/);
  });

  it("no longer runs or references the retired domain-metrics collector (#5561)", () => {
    // The collector needed a production venue id and auth token nobody would
    // provision, so it never produced a row and never could without a
    // human-supplied credential. Retired entirely rather than left disabled.
    expect(WORKFLOW).not.toMatch(/collect-domain-metrics\.mjs/);
    expect(WORKFLOW).not.toMatch(/DOMAIN_METRICS_VENUE_ID/);
    expect(WORKFLOW).not.toMatch(/DOMAIN_METRICS_API_BASE_URL/);
    expect(WORKFLOW).not.toMatch(/DOMAIN_METRICS_TOKEN/);
  });
});

describe("metrics-collectors workflow persists what it collected", () => {
  it("commits the review-burden metrics file back through a PR", () => {
    expect(WORKFLOW).toMatch(/peter-evans\/create-pull-request/);
    expect(WORKFLOW).toMatch(/metrics\/review-burden\.json/);
    expect(WORKFLOW).not.toMatch(/metrics\/domain-metrics\.jsonl/);
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

  it("runs the freshness check AFTER the collector, so it grades this run", () => {
    const burdenAt = WORKFLOW.indexOf("node scripts/acmm/review-burden-metrics.js");
    const freshnessAt = WORKFLOW.indexOf("node scripts/metrics-freshness.mjs");

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
    //
    // Anchored on the label's END (closing quote or end-of-word), not just its
    // start: the looser /--label "?ready"?/ this replaced also matched
    // `--label "ready-for-human"`, which is a DIFFERENT label and the correct
    // one for the human-blocked issue. A guard that cannot tell `ready` from
    // `ready-for-human` either blocks the right label or waves through the
    // wrong one.
    const issueStep = WORKFLOW.slice(WORKFLOW.indexOf("file-issue-cli.mjs"));
    expect(issueStep).not.toMatch(/--label\s+"?ready"(?!-)|--label\s+ready(?![-\w])/);
    expect(issueStep).toMatch(/--label/);
  });

  it("files the actionable finding under its own dedupe key", () => {
    // The `metrics-collection-unconfigured` key existed for the
    // permanently-blocked domain-metrics credential (#5561); now that the
    // collector is retired, only the actionable key remains and dedupe keys
    // stay unique across every issue this workflow files.
    expect(WORKFLOW).toMatch(/--dedupe-key "metrics-collection-stale"/);
    expect(WORKFLOW).not.toMatch(/--dedupe-key "metrics-collection-unconfigured"/);

    const keys = [...WORKFLOW.matchAll(/--dedupe-key "([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("asks the check for machine-readable output so it CAN route", () => {
    // The partition only exists if the workflow reads it. A bare
    // `metrics-freshness.mjs` invocation cannot tell failures apart from
    // any (currently always-empty) human-blocked findings.
    expect(WORKFLOW).toMatch(/metrics-freshness\.mjs --json/);
    expect(WORKFLOW).toMatch(/\.failures \| length/);
  });

  it("files no human-blocked agent-spend issue — uninstrumented passes by design (#5627)", () => {
    // #3585 was decided as local-only spend recording (`--adapter claude-cli`),
    // so CI having no writer is the design, not a pending human call. The old
    // `agent-spend-uninstrumented` issue refiled #5627 with nothing to fix;
    // only the actionable `stalled`/`undeterminable` issue remains.
    expect(WORKFLOW).not.toMatch(/agent-spend-uninstrumented/);
    expect(WORKFLOW).toMatch(/--dedupe-key "agent-spend-telemetry-broken"/);
  });

  it("asks the agent-spend check for machine-readable output", () => {
    expect(WORKFLOW).toMatch(/agent-spend-telemetry\.mjs --json/);
  });

  it("gives every filed issue a distinct --contains probe", () => {
    // `fileIssue()` dedupes on the `--contains` substring as well as the key.
    // Two issues whose probes overlap dedupe into each other regardless of
    // how distinct their keys are.
    const probes = [...WORKFLOW.matchAll(/--contains "([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(probes).size).toBe(probes.length);
    for (const a of probes) {
      for (const b of probes) {
        if (a !== b) expect(a.includes(b)).toBe(false);
      }
    }
  });
});
