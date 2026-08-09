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
 * Prefix every label `tier-classifier.yml` applies shares. Used by
 * `isAutomationAutoMergeEligible` to distinguish "classified as low-risk"
 * from "never classified at all" — see its fail-closed check.
 */
export const TIER_LABEL_PREFIX = "tier:";

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
 * Fails closed on an unclassified PR. The four workflows above fall back to
 * `GITHUB_TOKEN` because `AUTOMATION_PAT` is not configured as a repo secret,
 * and GitHub's anti-recursion rule means `tier-classifier.yml` (triggered only
 * on `pull_request: opened/synchronize/reopened`) does not reliably run on
 * their PRs. Measured 2026-08-06: 4 of 14 recent merged automation PRs
 * (#3826, #3816, #3638, #3637) carry no `tier:*` label at all.
 *
 * That makes "no blocking tier label" ambiguous — it means either "classified
 * and low-risk" or "never classified". Treating the two alike would be a
 * REGRESSION against the hand-maintained sensitive-path regex this function
 * replaced: that regex read the PR's own file list and could not miss, so it
 * always blocked e.g. `drift-fix.yml`'s committable `infrastructure/worker/
 * dep-graph.json` output. A label-derived gate that silently no-ops on
 * unlabelled PRs would let exactly those through.
 *
 * So an absent `tier:*` label is itself disqualifying here: a missing
 * classification is not evidence of low risk. Configuring `AUTOMATION_PAT`
 * (or dispatching `tier-classifier.yml` the way these workflows already
 * dispatch `ci.yml`) restores auto-merge for them; until then they wait for
 * a human, which is the safe direction to fail.
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

  // Fail closed: no tier:* label at all means tier-classifier never ran, not
  // that the change is low-risk. See the note above the function. Ordered
  // last so the more specific blocks (explicit tier, missing auto-merge,
  // explicit needs-review) report their own reason instead of this one.
  const isClassified = labelNames.some((label) => label.startsWith(TIER_LABEL_PREFIX));
  if (!isClassified) {
    return {
      eligible: false,
      reason:
        "no tier:* label — tier-classifier did not run; unclassified PRs require human approval",
    };
  }

  return { eligible: true, reason: "auto-merge label present, classified, no blocking tier label" };
}

/**
 * The single automation identity `auto-merge.yml` currently trusts to
 * proceed to `gh pr merge --auto` once `isAutomationAutoMergeEligible`
 * passes (#3871).
 *
 * Pre-#3871, `auto-merge.yml` compared `.author.login` against literal
 * strings (`github-actions[bot]`, `dependabot[bot]`, `renovate[bot]`,
 * `mbe-agent`) plus an `ends-with-[bot]` wildcard — all legacy GraphQL-era
 * bot-login formats. `gh pr view --json author` on this repo's `gh`
 * version reports GitHub-App-authored content as `app/<slug>` instead
 * (verified live: `gh pr view <N> --json author -q .author.login` ->
 * `app/github-actions`), so none of those literals — or the wildcard,
 * which no `app/`-prefixed login ends with — ever matched. The
 * trusted-author branch was unreachable for the workflow's entire life;
 * every automation PR silently took the skip path (#3826 was merged
 * manually by Matt, never by the workflow — see the PR history cited in
 * #3871).
 *
 * Deliberately a single-entry allowlist, not a `login.startsWith("app/")`
 * check: `app/`-prefixed is not by itself proof of trust (`app/claude`,
 * `app/dependabot` are also real, live `gh` output — confirmed on #3865
 * and via `gh pr list --search author:app/dependabot` — and neither
 * should skip review here). The four workflows that apply the
 * `auto-merge` label (production-feedback, pr-metrics, drift-fix,
 * acmm-regression) all push via `peter-evans/create-pull-request` with
 * `token: ${{ secrets.AUTOMATION_PAT || secrets.GITHUB_TOKEN }}`;
 * AUTOMATION_PAT is not configured (docs/SECRETS.md), so every one of
 * them falls back to `GITHUB_TOKEN` and is reported as `app/github-actions`
 * — the one identity this list needs. If AUTOMATION_PAT is ever
 * configured, its bot-account login is unknown in advance and must be
 * measured (not guessed) and added here explicitly.
 */
export const TRUSTED_AUTOMATION_AUTHORS = ["app/github-actions"];

/**
 * Pure predicate backing `auto-merge.yml`'s trusted-author gate. See
 * `TRUSTED_AUTOMATION_AUTHORS` above for the security rationale.
 *
 * @param {string | undefined} login - `.author.login` from `gh pr view --json author`.
 * @returns {boolean}
 */
export function isTrustedAutomationAuthor(login) {
  if (!login) return false;
  return TRUSTED_AUTOMATION_AUTHORS.includes(login);
}

/**
 * Combined automation-merge decision: tier/label eligibility AND trusted
 * authorship in one call (#3982 AC4).
 *
 * The four producer workflows' own "Enable auto-merge" steps (#3972) run
 * `isAutomationAutoMergeEligible` then `isTrustedAutomationAuthor` as two
 * separate bash/node calls. `scripts/rescue-automation-prs.mjs`'s
 * `ensureAutoMerge` callback used to skip both checks and call
 * `gh pr merge --auto` unconditionally — a permanent bypass of the same
 * gate, flagged in #3972 review as "not yet reconciled". This function is
 * the single source of truth both call sites should use going forward so
 * the two checks can't drift out of order or get skipped independently.
 *
 * @param {{labelNames?: string[], authorLogin?: string}} [input]
 * @returns {{ eligible: boolean, reason: string }}
 */
export function isAutomationMergeAllowed({ labelNames = [], authorLogin } = {}) {
  const tierDecision = isAutomationAutoMergeEligible(labelNames);
  if (!tierDecision.eligible) {
    return tierDecision;
  }

  if (!isTrustedAutomationAuthor(authorLogin)) {
    return {
      eligible: false,
      reason: `author '${authorLogin ?? ""}' not in TRUSTED_AUTOMATION_AUTHORS`,
    };
  }

  return { eligible: true, reason: tierDecision.reason };
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand === "check-author") {
    const login = readFlag(rest, "--login") ?? "";
    console.log(JSON.stringify({ login, trusted: isTrustedAutomationAuthor(login) }));
    return;
  }

  if (subcommand !== "check") {
    console.error(
      "Usage: merge-queue-eligibility.mjs check --labels <comma-separated-labels> [--mode automation]\n" +
        "       merge-queue-eligibility.mjs check-author --login <gh-author-login>"
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
