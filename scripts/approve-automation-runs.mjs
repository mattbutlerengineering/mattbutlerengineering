#!/usr/bin/env node

/**
 * approve-automation-runs.mjs — unblock the `action_required` park on an
 * automation/* PR's own pull_request-triggered runs (#3982).
 *
 * #3972 fixed the eligibility gate producers consult before enabling
 * auto-merge, but that gate was aimed at a link in the chain that was
 * already unreachable: `tier-classifier.yml` only runs on `pull_request`
 * events, and every pull_request-triggered run on these PRs — CI,
 * tier-classifier, Auto Review, ADR check, ... — parks at `action_required`
 * because the PR's commits are pushed via `GITHUB_TOKEN` (or a not-yet-
 * configured `AUTOMATION_PAT`), not a full collaborator identity (#3684).
 * With no `tier:*` label ever landing, `isAutomationAutoMergeEligible`
 * fails closed forever — correctly, per its own docstring, but the actual
 * fix is to unblock the parked runs, not merely to gate on their absence.
 *
 * `#3972`'s `Dispatch CI on the automation branch` step does not substitute
 * for this: a `workflow_dispatch` run is a *different* run than the PR's own
 * required `pull_request` `CI Gate` check, so a green dispatch run does not
 * make the PR's `CI Gate` appear (gotcha #3969's `gate-missing` state).
 *
 * This script approves every `action_required` run on an automation/* PR's
 * branch so the real `pull_request`-triggered jobs — including `CI Gate`
 * itself and `tier-classifier` — actually execute. Approval is scoped
 * tightly: only for a PR on an `automation/*` branch, carrying the
 * `auto-merge` label, opened by the one automation identity
 * `scripts/merge-queue-eligibility.mjs` already trusts
 * (`TRUSTED_AUTOMATION_AUTHORS`). It never approves an arbitrary pending
 * run — `auto-qa-tune.yml`'s deliberately-unlabeled PR (which needs a human
 * merge) is excluded by the same label check `rescue-automation-prs.mjs`
 * uses.
 *
 * Known unverified assumption (flagged, not silently assumed): the REST
 * endpoint this wraps (`POST .../actions/runs/{run_id}/approve`) is
 * documented by GitHub primarily for approving a *fork* PR's first-time-
 * contributor run. Whether it also approves the GITHUB_TOKEN-authored,
 * same-repo `action_required` park docs/SECRETS.md describes could not be
 * confirmed from this sandboxed session (no live `gh`/GitHub API access).
 * If it turns out to no-op or error on these runs, `AUTOMATION_PAT` (already
 * wired as the preferred token source across every producer via
 * `secrets.AUTOMATION_PAT || secrets.GITHUB_TOKEN`) remains the fallback
 * fix — see docs/SECRETS.md's `AUTOMATION_PAT` section.
 *
 * #4712: a single-shot `listRuns()` call race-loses against GitHub actually
 * creating the nine `pull_request`-triggered runs — the approve step ran
 * within seconds of the PR opening, found nothing yet, logged "approved 0
 * run(s)" (success), and moved on. The runs then parked at `action_required`
 * unapproved and died as bare `failure` (zero jobs) once the branch was
 * deleted on auto-merge ~11 minutes later. `approvePendingRuns` now polls
 * `listRuns()` on a bounded loop (default: every 5s, up to a 60s ceiling)
 * instead of checking once, approving any newly-seen run each round, and
 * stopping as soon as two consecutive polls see no new run IDs ("settled").
 * A timeout with runs still unapproved logs a warning naming them but never
 * fails the step — a metrics PR should not be blocked by this.
 *
 * Design: `isAutomationPrApprovable`, `selectActionRequiredRuns`, and
 * `decidePollStep` are pure, unit-tested without the network
 * (`scripts/__tests__/approve-automation-runs.test.mjs`). The GitHub calls
 * live behind injected callbacks in `approvePendingRuns`; the CLI below
 * wires them to raw `gh` calls.
 *
 * Usage:
 *   node scripts/approve-automation-runs.mjs approve --pr <N>
 *   node scripts/approve-automation-runs.mjs approve --pr <N> --dry-run
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isTrustedAutomationAuthor } from "./merge-queue-eligibility.mjs";
import { AUTOMATION_BRANCH_PREFIX, AUTOMATION_LABEL, hasLabel } from "./lib/automation-pr.mjs";

/** Default bounded-poll tuning (#4712) — tuned from the observed queuing
 * delay (runs typically all appear within a few seconds), not guessed. */
export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Pure gate on which PRs this script may approve pending runs for.
 * Deliberately conservative — never a blanket approval of arbitrary pending
 * runs, only runs on an automation/* PR carrying `auto-merge` from the one
 * identity `merge-queue-eligibility.mjs` already trusts.
 *
 * @param {{headRefName?:string, labels?:Array, author?:{login?:string}}} pr
 * @returns {{ approvable: boolean, reason: string }}
 */
export function isAutomationPrApprovable(pr) {
  if (typeof pr?.headRefName !== "string" || !pr.headRefName.startsWith(AUTOMATION_BRANCH_PREFIX)) {
    return { approvable: false, reason: "head branch is not under automation/" };
  }

  if (!hasLabel(pr, AUTOMATION_LABEL)) {
    return { approvable: false, reason: `missing ${AUTOMATION_LABEL} label` };
  }

  const authorLogin = pr?.author?.login;
  if (!isTrustedAutomationAuthor(authorLogin)) {
    return {
      approvable: false,
      reason: `author '${authorLogin ?? ""}' not in TRUSTED_AUTOMATION_AUTHORS`,
    };
  }

  return { approvable: true, reason: "automation/* branch, auto-merge label, trusted author" };
}

/**
 * Pure: filters a `gh run list --json` result down to runs parked at
 * `action_required` — the state a run sits in while awaiting approval.
 *
 * @param {Array<{databaseId?:number, status?:string}>} runs
 * @returns {Array} the subset awaiting approval (new array; input not mutated)
 */
export function selectActionRequiredRuns(runs) {
  return (runs ?? []).filter((run) => run?.status === "action_required");
}

/**
 * Pure poll-loop decision core (#4712). Given the sequence of
 * action_required run-ID snapshots observed so far (oldest first, the
 * current poll last) and how much time has elapsed since the first poll,
 * decides whether to poll again, stop because the set of pending runs has
 * settled (no new run ID appeared since the previous poll), or stop because
 * the timeout elapsed.
 *
 * Settling is judged against the union of every prior snapshot, not just the
 * immediately preceding one — a run that gets approved mid-poll can drop out
 * of the next `action_required` snapshot as it transitions to `queued`, and
 * that shrinkage must not read as "still arriving".
 *
 * @param {{ snapshots: number[][], elapsedMs: number, timeoutMs: number }} input
 * @returns {"poll-again" | "settled" | "timed-out"}
 */
export function decidePollStep({ snapshots, elapsedMs, timeoutMs }) {
  const current = snapshots[snapshots.length - 1] ?? [];
  const seenBefore = new Set(snapshots.slice(0, -1).flat());
  const hasNewRuns = current.some((id) => !seenBefore.has(id));
  const seenAny = snapshots.some((snapshot) => snapshot.length > 0);

  if (snapshots.length > 1 && seenAny && !hasNewRuns) {
    return "settled";
  }
  if (elapsedMs >= timeoutMs) {
    return "timed-out";
  }
  return "poll-again";
}

/**
 * Approves every `action_required` run on an approvable PR's branch,
 * polling on a bounded loop (#4712) so a run that hasn't been created yet
 * by the time the first `listRuns()` call fires still gets approved.
 *
 * @param {{
 *   getPr: () => Promise<{headRefName?:string, labels?:Array, author?:{login?:string}}>,
 *   listRuns: (headRefName:string) => Promise<Array>,
 *   approveRun: (runId:number) => Promise<void>,
 *   dryRun?: boolean,
 *   log?: (msg:string) => void,
 *   pollIntervalMs?: number,
 *   timeoutMs?: number,
 *   now?: () => number,
 *   sleep?: (ms:number) => Promise<void>,
 * }} deps
 * @returns {Promise<number[]>} the run ids that were (or would be) approved
 */
export async function approvePendingRuns({
  getPr,
  listRuns,
  approveRun,
  dryRun = false,
  log = () => {},
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  // getPr()/listRuns() are wrapped the same way as approveRun() below: a
  // transient gh-CLI error (5xx, rate limit, auth hiccup) here must not
  // propagate uncaught — that would fail the calling workflow step and skip
  // "Enable auto-merge" entirely (#4009).
  let pr;
  try {
    pr = await getPr();
  } catch (err) {
    log(`failed to fetch PR: ${err.message}`);
    return [];
  }

  const decision = isAutomationPrApprovable(pr);
  if (!decision.approvable) {
    log(`skipping: ${decision.reason}`);
    return [];
  }

  const startedAt = now();
  const snapshots = [];
  const attemptedIds = new Set();
  const approvedIds = new Set();

  for (;;) {
    let runs;
    try {
      runs = await listRuns(pr.headRefName);
    } catch (err) {
      log(`failed to list runs: ${err.message}`);
      return [...approvedIds];
    }

    const pending = selectActionRequiredRuns(runs);
    const currentIds = pending.map((run) => run.databaseId);
    snapshots.push(currentIds);

    // Each run's approval is isolated: a transient failure on one run must
    // not skip the rest — mirrors rescue-automation-prs.mjs's per-PR
    // try/catch. A run is only ever attempted once, even across polls.
    for (const run of pending) {
      if (attemptedIds.has(run.databaseId)) continue;
      attemptedIds.add(run.databaseId);

      if (dryRun) {
        log(`[dry-run] would approve run ${run.databaseId}`);
        approvedIds.add(run.databaseId);
        continue;
      }
      try {
        await approveRun(run.databaseId);
        log(`approved run ${run.databaseId}`);
        approvedIds.add(run.databaseId);
      } catch (err) {
        log(`failed to approve run ${run.databaseId}: ${err.message}`);
      }
    }

    const elapsedMs = now() - startedAt;
    const step = decidePollStep({ snapshots, elapsedMs, timeoutMs });

    if (step === "settled") {
      return [...approvedIds];
    }
    if (step === "timed-out") {
      const stillParked = [...attemptedIds].filter((id) => !approvedIds.has(id));
      if (attemptedIds.size === 0) {
        log(
          `timed out after ${elapsedMs}ms waiting for action_required runs to appear on ${pr.headRefName}; none appeared`
        );
      } else if (stillParked.length > 0) {
        log(
          `timed out after ${elapsedMs}ms with runs still parked: ${stillParked
            .map((id) => `#${id}`)
            .join(", ")}`
        );
      }
      return [...approvedIds];
    }

    await sleep(pollIntervalMs);
  }
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

/** CLI entry: wires raw `gh` calls to {@link approvePendingRuns}. */
async function run() {
  const args = process.argv.slice(3);
  const prNumber = readFlag(args, "--pr");
  const dryRun = process.argv.includes("--dry-run");

  if (process.argv[2] !== "approve" || !prNumber) {
    console.error("Usage: approve-automation-runs.mjs approve --pr <N> [--dry-run]");
    process.exit(1);
  }

  const approved = await approvePendingRuns({
    getPr: async () =>
      JSON.parse(
        execFileSync("gh", ["pr", "view", prNumber, "--json", "headRefName,labels,author"], {
          encoding: "utf-8",
        })
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
        {
          stdio: "inherit",
        }
      );
    },
    dryRun,
    log: (msg) => console.log(`[approve-automation-runs] ${msg}`),
  });

  console.log(
    `[approve-automation-runs] ${dryRun ? "[dry-run] " : ""}approved ${approved.length} run(s): ${
      approved.map((id) => `#${id}`).join(", ") || "none"
    }`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    process.stderr.write(`[approve-automation-runs] Error: ${err.message}\n`);
    process.exit(1);
  });
}
