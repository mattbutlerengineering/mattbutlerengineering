#!/usr/bin/env node

/**
 * rescue-automation-prs.mjs — scheduled follow-up pass for automation/* PRs
 * that fall behind `main` after creation (#3966).
 *
 * production-feedback.yml (and its siblings drift-fix.yml, pr-metrics.yml,
 * acmm-regression.yml) each open a PR from an `automation/*` branch, dispatch
 * CI on it, and now enable auto-merge directly right after creating the PR.
 * That direct enable exists because the workflow that would normally do it —
 * auto-merge.yml — never runs on these PRs: its own `pull_request` /
 * `check_suite` triggers park at `action_required` for the same reason
 * `ci.yml`'s do (gotcha #3684), so it never reaches its own `gh pr merge
 * --auto` call.
 *
 * A same-run enable is not enough on its own, though: `main` is `strict`, so
 * a PR that falls behind hours later — once a sibling PR merges — will not
 * auto-merge until its branch is brought up to date, and nothing in the
 * producing workflow runs again later in the day to do that. This script is
 * that later pass, invoked on a schedule by
 * `.github/workflows/automation-pr-rescue.yml`: find open `automation/*` PRs
 * carrying the `auto-merge` label that GitHub reports as `BEHIND`, update
 * their branch, and re-dispatch CI on the resulting new head SHA — the
 * update-branch merge commit is itself pushed by automation, so its own
 * `pull_request` run would park at `action_required` exactly like the PR's
 * original commit did (see `check-ci-dispatch.mjs` for the general dispatch
 * requirement every PR-opening workflow must satisfy).
 *
 * `auto-qa-tune.yml` deliberately opens its PR without the `auto-merge`
 * label (it touches `.github/` and needs a human merge — see its own
 * workflow comment); `selectPrsToRescue`'s label filter excludes it for
 * free, no separate carve-out needed.
 *
 * #3982: `update-branch`'s merge commit is itself GITHUB_TOKEN/AUTOMATION_PAT
 * -authored, so its own `pull_request` synchronize run parks at
 * `action_required` (#3684) exactly like the PR's original commit did — the
 * re-dispatched CI run's CI Gate check never appears without re-approving
 * it. `runRescue` now also calls `approveRuns` after `updateBranch` (see
 * `scripts/approve-automation-runs.mjs`) for that reason, and its CLI
 * `ensureAutoMerge` callback is routed through
 * `merge-queue-eligibility.mjs`'s `isAutomationMergeAllowed` instead of
 * calling `gh pr merge --auto` unconditionally — closing the "not yet
 * reconciled" bypass flagged in #3972 review.
 *
 * Design: selection is a pure function (`selectPrsToRescue`), unit-tested
 * without the network (`scripts/__tests__/rescue-automation-prs.test.mjs`).
 * The GitHub mutations live behind injected callbacks in `runRescue`; the
 * CLI below wires them to raw `gh` calls (no `@mbe/gh-client` dependency —
 * this script needs no more than `gh pr list`/`update-branch`/`merge` and
 * `gh workflow run`, so it can run with a plain checkout + Node, no
 * `pnpm install` or package build required).
 *
 * Usage:
 *   node scripts/rescue-automation-prs.mjs
 *   node scripts/rescue-automation-prs.mjs --dry-run
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAutomationMergeAllowed } from "./merge-queue-eligibility.mjs";
import { approvePendingRuns } from "./approve-automation-runs.mjs";
import { AUTOMATION_BRANCH_PREFIX, AUTOMATION_LABEL, hasLabel } from "./lib/automation-pr.mjs";

// Re-exported for existing callers/tests importing these from this module —
// scripts/lib/automation-pr.mjs is the source of truth (extracted to break
// a circular import with approve-automation-runs.mjs; see its doc comment).
export { AUTOMATION_BRANCH_PREFIX, AUTOMATION_LABEL, hasLabel };

/** `gh pr list --json` field set `selectPrsToRescue` needs. */
export const PR_JSON_FIELDS = "number,headRefName,mergeStateStatus,isDraft,labels";

/**
 * Pure: selects open automation/* PRs that need a branch-update rescue.
 *
 * A PR qualifies when its head branch starts with `automation/`, it carries
 * the `auto-merge` label (so a human-merge-only automation PR is never
 * touched), it is not a draft, and GitHub reports it as `BEHIND` main —
 * `gh pr update-branch` only makes sense for that specific state; a `DIRTY`
 * (conflicted) PR needs a human, not a mechanical rescue.
 *
 * @param {Array<{number:number, headRefName:string, mergeStateStatus?:string, isDraft?:boolean, labels?:Array}>} prs
 * @returns {Array} the subset of prs to rescue (new array; input not mutated)
 */
export function selectPrsToRescue(prs) {
  return (prs ?? []).filter(
    (pr) =>
      typeof pr?.headRefName === "string" &&
      pr.headRefName.startsWith(AUTOMATION_BRANCH_PREFIX) &&
      !pr.isDraft &&
      hasLabel(pr, AUTOMATION_LABEL) &&
      pr.mergeStateStatus === "BEHIND"
  );
}

/**
 * Rescues the selected PRs: update-branch, approve any resulting
 * `action_required` runs (#3982 — the update-branch merge commit parks
 * exactly like the PR's original commit did), re-dispatch CI on the new
 * head SHA, then re-assert auto-merge (idempotent — belt-and-suspenders in
 * case the producing workflow's own enable failed transiently).
 *
 * @param {{
 *   listPrs: () => Promise<Array>,
 *   updateBranch: (number:number) => Promise<void>,
 *   approveRuns?: (number:number) => Promise<void>,
 *   dispatchCi: (headRefName:string) => Promise<void>,
 *   ensureAutoMerge: (number:number) => Promise<void>,
 *   dryRun?: boolean,
 *   log?: (msg:string) => void,
 * }} deps
 * @returns {Promise<number[]>} the PR numbers that were (or would be) rescued
 */
export async function runRescue({
  listPrs,
  updateBranch,
  approveRuns = async () => {},
  dispatchCi,
  ensureAutoMerge,
  dryRun = false,
  log = () => {},
}) {
  const prs = await listPrs();
  const selected = selectPrsToRescue(prs);
  const rescued = [];

  for (const pr of selected) {
    if (dryRun) {
      log(`[dry-run] would rescue #${pr.number} (${pr.headRefName})`);
      rescued.push(pr.number);
      continue;
    }
    // Each PR's rescue is isolated: a transient updateBranch/approveRuns/
    // dispatchCi/ensureAutoMerge failure on one PR must not abort the batch
    // — without this, one flaky call skipped every remaining PR in the
    // 30-minute pass.
    try {
      await updateBranch(pr.number);
      await approveRuns(pr.number);
      await dispatchCi(pr.headRefName);
      await ensureAutoMerge(pr.number);
      log(`rescued #${pr.number} (${pr.headRefName})`);
      rescued.push(pr.number);
    } catch (err) {
      log(`failed to rescue #${pr.number} (${pr.headRefName}): ${err.message}`);
    }
  }

  return rescued;
}

/** CLI entry: wires raw `gh` calls to {@link runRescue}. */
async function run() {
  const dryRun = process.argv.includes("--dry-run");

  const rescued = await runRescue({
    listPrs: async () =>
      JSON.parse(
        execFileSync(
          "gh",
          ["pr", "list", "--state", "open", "--json", PR_JSON_FIELDS, "--limit", "50"],
          {
            encoding: "utf-8",
          }
        )
      ),
    updateBranch: async (number) => {
      execFileSync("gh", ["pr", "update-branch", String(number)], { stdio: "inherit" });
    },
    approveRuns: async (number) => {
      // The update-branch merge commit above is itself GITHUB_TOKEN/
      // AUTOMATION_PAT-authored, so its own pull_request synchronize run
      // parks at action_required (#3684) exactly like the PR's original
      // commit did — see scripts/approve-automation-runs.mjs.
      await approvePendingRuns({
        getPr: async () =>
          JSON.parse(
            execFileSync(
              "gh",
              ["pr", "view", String(number), "--json", "headRefName,labels,author"],
              {
                encoding: "utf-8",
              }
            )
          ),
        listRuns: async (headRefName) =>
          JSON.parse(
            execFileSync(
              "gh",
              [
                "run",
                "list",
                "--branch",
                headRefName,
                "--status",
                "action_required",
                "--json",
                "databaseId,status",
                "--limit",
                "50",
              ],
              { encoding: "utf-8" }
            )
          ),
        approveRun: async (runId) => {
          execFileSync(
            "gh",
            ["api", "-X", "POST", `repos/{owner}/{repo}/actions/runs/${runId}/approve`],
            { stdio: "inherit" }
          );
        },
        log: (msg) => console.log(`[rescue-automation-prs] ${msg}`),
      });
    },
    dispatchCi: async (headRefName) => {
      execFileSync("gh", ["workflow", "run", "ci.yml", "--ref", headRefName], { stdio: "inherit" });
    },
    ensureAutoMerge: async (number) => {
      // Routed through the same eligibility + trusted-author decision the
      // four producer workflows consult (#3982 AC4) — a direct, unconditional
      // `gh pr merge --auto` here would be a permanent bypass of the tier
      // gate hardened after #3787/#3871/#3972 for every PR this script's
      // BEHIND filter ever selects. Isolation from a failure here (or in
      // updateBranch/approveRuns/dispatchCi above) is handled once,
      // generically, by runRescue's per-PR try/catch.
      const labelsCsv = execFileSync(
        "gh",
        ["pr", "view", String(number), "--json", "labels", "-q", '[.labels[].name] | join(",")'],
        { encoding: "utf-8" }
      ).trim();
      const authorLogin = execFileSync(
        "gh",
        ["pr", "view", String(number), "--json", "author", "-q", ".author.login"],
        { encoding: "utf-8" }
      ).trim();
      const decision = isAutomationMergeAllowed({
        labelNames: labelsCsv ? labelsCsv.split(",") : [],
        authorLogin,
      });
      if (!decision.eligible) {
        console.log(
          `[rescue-automation-prs] auto-merge not enabled for #${number}: ${decision.reason}`
        );
        return;
      }
      execFileSync("gh", ["pr", "merge", String(number), "--auto", "--squash", "--delete-branch"], {
        stdio: "inherit",
      });
    },
    dryRun,
    log: (msg) => console.log(`[rescue-automation-prs] ${msg}`),
  });

  console.log(
    `[rescue-automation-prs] ${dryRun ? "[dry-run] " : ""}rescued ${rescued.length} PR(s): ${
      rescued.map((n) => `#${n}`).join(", ") || "none"
    }`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    process.stderr.write(`[rescue-automation-prs] Error: ${err.message}\n`);
    process.exit(1);
  });
}
