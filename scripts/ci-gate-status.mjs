#!/usr/bin/env node

/**
 * ci-gate-status.mjs — classify a PR's `CI Gate` state from its
 * `statusCheckRollup`, cross-referenced against the head SHA's raw
 * check-runs (#3969, #4023).
 *
 * A worker PR can open with ZERO `pull_request` workflow runs (a transient
 * GitHub event-delivery failure — ruled out as the GITHUB_TOKEN
 * anti-recursion trap, a paths filter, concurrency cancellation, and the
 * action_required approval park; see #3969 for the full elimination).
 * `CI Gate` is the sole required check on `main`, so a PR that never gets a
 * run for it sits `BLOCKED` forever with nothing red — no failing check, no
 * pending check, just an absent one.
 *
 * That is the trap this module closes: a naive "any failures? any pending?"
 * read of the rollup reports `fail=0 pend=0` for a no-CI PR, which is
 * indistinguishable from a genuinely green one unless the caller separately
 * asserts that a check named "CI Gate" exists at all. `classifyCiGateStatus`
 * makes that a fourth, explicit state (`gate-missing`) that can never be
 * conflated with `green`.
 *
 * #4023: `statusCheckRollup` omits check runs produced by `workflow_dispatch`
 * — the SKILL.md `gate-missing` recovery is exactly `gh workflow run ci.yml
 * --ref <branch>`, so the recovery's own output is invisible to the rollup,
 * and re-polling loops `gate-missing` forever. The obvious-looking fix —
 * fall back to the head-SHA check-runs API and report `green` when it has a
 * successful `CI Gate` — was tested and REJECTED: on PR #4011,
 * `gh pr merge --auto` was accepted with a dispatch-produced `CI Gate:
 * success` on the head SHA, and the PR sat `mergeStateStatus=BLOCKED` for 6+
 * minutes and never merged. GitHub's own merge evaluation reads the rollup,
 * not the check-runs API, so a dispatch-only "success" satisfies nothing.
 * Reporting `green` there would silently green-light a PR GitHub will never
 * merge — worse than the loop it would "fix". Instead, `gate-unattributed`
 * is a third, distinct state: CI genuinely ran (so `gate-missing`'s
 * re-dispatch recovery is pointless — another run is just as invisible to
 * the rollup) but the PR is still not mergeable and still needs a human (or
 * `ci.yml` publishing a commit *status*, tracked separately, out of scope
 * here). See the `.claude/skills/implement-queue/SKILL.md` Phase 2
 * worker→train boundary, step 1, for how the orchestrator consumes all
 * three non-green states.
 *
 * Pure and network-free: takes an already-fetched `statusCheckRollup` array
 * (from `gh pr view --json statusCheckRollup`) and an already-fetched
 * head-SHA check-runs array (from `gh api repos/{owner}/{repo}/commits/
 * {sha}/check-runs`) and never shells out itself, so it's unit-testable
 * without mocking `gh`. The CLI below is a thin caller that fetches both and
 * prints the classification as JSON.
 *
 * Usage:
 *   node scripts/ci-gate-status.mjs check --pr <N>
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The sole required status check on `main` (green-main policy). */
export const CI_GATE_CHECK_NAME = "CI Gate";

/**
 * Resolve the winning check-run among possibly-duplicate same-named entries
 * (a PR can accumulate one `CI Gate` check-run per `workflow_dispatch`).
 * Most recent by `completed_at` (falling back to `started_at`) wins,
 * regardless of array order or conclusion — so a later failure is never
 * masked by an earlier success, and vice versa. ISO 8601 timestamps sort
 * correctly as plain strings, so no Date parsing is needed.
 *
 * @param {Array<{name?: string, completed_at?: string|null, started_at?: string|null}>} checkRuns
 * @param {string} name
 * @returns {object|null}
 */
function resolveLatestCheckRun(checkRuns, name) {
  const matches = checkRuns.filter((run) => run?.name === name);
  if (matches.length === 0) return null;

  return matches.reduce((latest, run) => {
    const latestTime = latest.completed_at ?? latest.started_at ?? "";
    const runTime = run.completed_at ?? run.started_at ?? "";
    return runTime > latestTime ? run : latest;
  });
}

/**
 * Pure classifier: given a PR's `statusCheckRollup` array and (optionally)
 * its head SHA's raw check-runs array, decide whether its `CI Gate` check
 * is green, failed, pending, missing entirely, or present-but-unattributed.
 *
 * `gate-missing` and `gate-unattributed` are both distinct from `green` —
 * the caller (Phase 2's worker→train boundary) must never enqueue a PR in
 * either state. `gate-missing` recovers via re-dispatch; `gate-unattributed`
 * does not (see module docstring) and needs a human. Never throws: an
 * unexpected input shape (missing/non-array rollup or check-runs) degrades
 * toward `gate-missing` rather than propagating an error, since "I can't
 * find a mergeable CI Gate" is the safe conclusion either way.
 *
 * @param {Array<{name?: string, context?: string, status?: string, conclusion?: string|null}>} [statusCheckRollup]
 * @param {Array<{name?: string, status?: string, conclusion?: string|null, started_at?: string|null, completed_at?: string|null}>} [headShaCheckRuns]
 * @returns {{ state: "green"|"failed"|"pending"|"gate-missing"|"gate-unattributed", reason: string }}
 */
export function classifyCiGateStatus(statusCheckRollup, headShaCheckRuns) {
  const rollup = Array.isArray(statusCheckRollup) ? statusCheckRollup : [];
  const checkRuns = Array.isArray(headShaCheckRuns) ? headShaCheckRuns : [];
  // `statusCheckRollup` mixes two GraphQL shapes — CheckRun (`.name`) and
  // StatusContext (`.context`) — so match either (#3987 review follow-up).
  const gate = rollup.find((check) => (check?.name ?? check?.context) === CI_GATE_CHECK_NAME);

  if (!gate) {
    // CI Gate aggregates every other job and reports last, so its absence
    // is the expected state for the first several minutes of every PR's
    // CI run — not just the #3968 "CI never ran" failure mode. Only
    // conclude "never ran" when nothing else on the SHA is still running.
    const anyRunning = rollup.some((check) => check?.status && check.status !== "COMPLETED");
    if (anyRunning) {
      return {
        state: "pending",
        reason: "CI is running but CI Gate has not reported yet",
      };
    }

    // #4023: the rollup has no CI Gate, but a workflow_dispatch run may
    // have produced one that the rollup structurally can't see. That run
    // is real, but GitHub's merge evaluation ignores it exactly as this
    // rollup does — so it must not classify as green, and re-dispatching
    // again cannot help either (the new run is equally invisible).
    const dispatched = resolveLatestCheckRun(checkRuns, CI_GATE_CHECK_NAME);
    if (dispatched) {
      const outcome =
        dispatched.conclusion === "success"
          ? "succeeded"
          : `concluded ${dispatched.conclusion ?? "unknown"}`;
      return {
        state: "gate-unattributed",
        reason:
          `"${CI_GATE_CHECK_NAME}" ${outcome} on a workflow_dispatch run visible only in the ` +
          `head-SHA check-runs API — it is absent from statusCheckRollup, the source GitHub's ` +
          `merge evaluation reads, so this PR is NOT mergeable (confirmed on #4011: gh pr merge ` +
          `--auto sat BLOCKED). Do not enqueue. Re-dispatching will not help — the new run is ` +
          `just as invisible to the rollup. Needs a human or a ci.yml commit-status fix (#4023).`,
      };
    }

    return {
      state: "gate-missing",
      reason: `no "${CI_GATE_CHECK_NAME}" check found on this SHA in the rollup or head-SHA check-runs — CI likely never ran`,
    };
  }

  if (gate.status !== "COMPLETED") {
    return {
      state: "pending",
      reason: `CI Gate is still ${gate.status ?? "pending"}`,
    };
  }

  if (gate.conclusion === "SUCCESS") {
    return { state: "green", reason: "CI Gate succeeded" };
  }

  return {
    state: "failed",
    reason: `CI Gate concluded ${gate.conclusion ?? "unknown"}`,
  };
}

/**
 * CLI entry: fetches the rollup and head-SHA check-runs for `--pr <N>` and
 * prints the classification. If the check-runs fetch fails (network/API
 * error), degrades to rollup-only classification — the safe direction,
 * since it can only under-report `gate-unattributed` as `gate-missing`,
 * never mis-report `gate-unattributed`/`gate-missing` as `green`.
 */
function run() {
  const args = process.argv.slice(3);
  const prIdx = args.indexOf("--pr");
  const prNumber = prIdx !== -1 ? args[prIdx + 1] : null;

  if (process.argv[2] !== "check" || !prNumber) {
    console.error("Usage: ci-gate-status.mjs check --pr <N>");
    process.exit(1);
  }

  const prView = JSON.parse(
    execFileSync("gh", ["pr", "view", prNumber, "--json", "statusCheckRollup,headRefOid"], {
      encoding: "utf-8",
    })
  );

  const checkRuns = fetchHeadShaCheckRuns(prView.headRefOid);

  console.log(JSON.stringify(classifyCiGateStatus(prView.statusCheckRollup, checkRuns)));
}

/**
 * Fetches the head SHA's raw check-runs (up to 100 — comfortably above the
 * ~31-job CI suite even doubled by a couple of dispatches). Returns `[]` on
 * any fetch failure rather than throwing, so a transient API error degrades
 * to rollup-only classification instead of crashing the CLI.
 *
 * `per_page` is embedded in the URL, not passed via `-F` — `gh api` switches
 * a GET to POST the moment any `-f`/`-F` field is present, and `POST
 * .../check-runs` 404s (confirmed live against this repo while building this
 * fix).
 */
function fetchHeadShaCheckRuns(headSha) {
  try {
    const response = JSON.parse(
      execFileSync(
        "gh",
        ["api", `repos/{owner}/{repo}/commits/${headSha}/check-runs?per_page=100`],
        {
          encoding: "utf-8",
        }
      )
    );
    return Array.isArray(response.check_runs) ? response.check_runs : [];
  } catch {
    return [];
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
