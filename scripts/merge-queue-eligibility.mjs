#!/usr/bin/env node

/**
 * merge-queue-eligibility.mjs — auto-merge eligibility decision for
 * `.github/workflows/merge-queue.yml` (#3787).
 *
 * docs/change-tiers.md: "Currently, only T1 PRs with all CI checks green are
 * auto-mergeable. T2 and above always require human approval. The user
 * (Matt) is the only required reviewer." Pre-#3787, merge-queue.yml only
 * read the `has-pr` / `needs-review` labels, so any PR without an explicit
 * `needs-review` label got auto-merge enabled regardless of the `tier:*`
 * label `tier-classifier` assigned — including `tier:standard`,
 * `tier:sensitive`, and `tier:critical` root-config, auth, or migration
 * changes docs/change-tiers.md says must wait for Matt's personal approval.
 * Reproduced live on 2026-08-04: PR #3786 (turbo.json, correctly classified
 * `tier:sensitive`) had auto-merge enabled twice by this workflow because it
 * carried no `needs-review` label.
 *
 * isAutoMergeEligible is a pure function, unit-tested without gh/network
 * (scripts/__tests__/merge-queue-eligibility.test.mjs). The CLI below is a
 * thin caller the workflow invokes with the PR's comma-joined label list.
 *
 * Usage:
 *   node scripts/merge-queue-eligibility.mjs check --labels "has-pr,tier:trivial"
 */

import { fileURLToPath } from "node:url";

/**
 * Tier labels that always block this workflow's auto-merge, regardless of
 * `needs-review` — T2 and above per docs/change-tiers.md. `tier:trivial`
 * (T1) and PRs with no `tier:*` label at all keep the pre-#3787 behavior.
 */
export const BLOCKED_TIER_LABELS = ["tier:standard", "tier:sensitive", "tier:critical"];

/**
 * Pure decision matching docs/change-tiers.md's auto-merge eligibility rule.
 * Either condition alone blocks: a blocking tier label, OR the pre-existing
 * has-pr/needs-review check — the tier check is additive, not a replacement.
 *
 * @param {string[]} [labelNames] - the PR's label names.
 * @returns {{ eligible: boolean, reason: string }}
 */
export function isAutoMergeEligible(labelNames = []) {
  const labels = new Set(labelNames);

  const blockedTier = BLOCKED_TIER_LABELS.find((tier) => labels.has(tier));
  if (blockedTier) {
    return {
      eligible: false,
      reason: `blocked by ${blockedTier} — requires human approval per docs/change-tiers.md`,
    };
  }

  if (!labels.has("has-pr")) {
    return { eligible: false, reason: "missing has-pr label" };
  }

  if (labels.has("needs-review")) {
    return { eligible: false, reason: "needs-review label is present" };
  }

  return { eligible: true, reason: "has-pr, no needs-review, no blocking tier label" };
}

/**
 * Automation carve-out for `.github/workflows/auto-merge.yml` (#3857).
 *
 * `auto-merge.yml` gates a *different* label (`auto-merge`) than
 * `merge-queue.yml`'s `has-pr` — applied by four workflows
 * (production-feedback, pr-metrics, drift-fix, acmm-regression) that open
 * PRs via `peter-evans/create-pull-request` and never apply `has-pr`. Before
 * #3857, `auto-merge.yml` gated those PRs with a hand-maintained
 * sensitive-path regex that never read `tier:*` at all — the same hole
 * #3787/#3796 closed in merge-queue.yml, left open in its sibling.
 *
 * Deliberate decision (do not silently loosen `has-pr`): `isAutoMergeEligible`
 * above keeps requiring `has-pr` unchanged — that label is the
 * implement-queue's own has-pr -> review -> merge boundary and must stay a
 * hard gate. This function is a distinct, explicit path for the automation
 * label instead: same tier check, `auto-merge` in place of `has-pr`.
 *
 * Known residual gap (documented, not fixed here — out of scope for #3857):
 * these four workflows fall back to `GITHUB_TOKEN` because `AUTOMATION_PAT`
 * is not configured as a repo secret. GitHub's anti-recursion rule means
 * `tier-classifier.yml` (triggered only on `pull_request: opened
 * /synchronize/reopened`) never runs on their PRs, so today they carry no
 * `tier:*` label at all — the tier check below is a no-op for them in
 * practice, identical to the gap `isAutoMergeEligible` already has for any
 * `has-pr` PR opened the same way. Configuring `AUTOMATION_PAT` (or
 * dispatching `tier-classifier.yml` the same way these workflows already
 * dispatch `ci.yml`) would close it; tracked as a follow-up, not bundled in.
 *
 * @param {string[]} [labelNames] - the PR's label names.
 * @returns {{ eligible: boolean, reason: string }}
 */
export function isAutomationAutoMergeEligible(labelNames = []) {
  const labels = new Set(labelNames);

  const blockedTier = BLOCKED_TIER_LABELS.find((tier) => labels.has(tier));
  if (blockedTier) {
    return {
      eligible: false,
      reason: `blocked by ${blockedTier} — requires human approval per docs/change-tiers.md`,
    };
  }

  if (!labels.has("auto-merge")) {
    return { eligible: false, reason: "missing auto-merge label" };
  }

  if (labels.has("needs-review")) {
    return { eligible: false, reason: "needs-review label is present" };
  }

  return { eligible: true, reason: "auto-merge label present, no blocking tier label" };
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand !== "check") {
    console.error(
      "Usage: merge-queue-eligibility.mjs check --labels <comma-separated-labels> [--mode automation]"
    );
    process.exit(1);
  }

  const labelsFlag = readFlag(rest, "--labels") ?? "";
  const labelNames = labelsFlag
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  const mode = readFlag(rest, "--mode") ?? "queue";

  const decide = mode === "automation" ? isAutomationAutoMergeEligible : isAutoMergeEligible;

  console.log(JSON.stringify(decide(labelNames)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
