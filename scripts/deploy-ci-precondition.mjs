#!/usr/bin/env node

/**
 * deploy-ci-precondition.mjs — decide whether the CI run a deploy is about
 * to wait on can ever finish, and recover it when it cannot.
 *
 * `deploy-services.yml`'s `Wait for CI` job blocks on CI's `Build` check for
 * `github.sha`, with a 30-minute discovery timeout. That is the right shape
 * when CI is merely slow. It is the wrong shape when CI on that ref was
 * **cancelled**, because `Build` will then never appear: the job burns the
 * full 30 minutes, fails, and — this is the part that matters — the commit
 * never deploys at all. Nothing else retries it, and the next commit only
 * deploys if it happens to touch one of this workflow's `paths:` filters, so
 * a merged change can sit undeployed indefinitely with `main` green.
 *
 * How CI gets cancelled on `main` without anyone cancelling it: `ci.yml`
 * declares `concurrency: {group: CI-<ref>, cancel-in-progress: <ref is not
 * main>}`. On `main` that resolves to `cancel-in-progress: false`, which
 * reads as "never cancel" but does not mean it — an in-progress run is
 * protected, while a *pending* one is not. When a third push arrives while
 * the first is still running, GitHub cancels the queued middle run to make
 * room. Measured on the three occurrences below, the cancellation lands
 * 13s-2m after the run is created, always within seconds of a newer run
 * being queued in the same group:
 *
 *   0e170179  2026-08-23  CI created 23:43:25, cancelled 23:43:38 (13s)
 *   fad02f44  2026-08-15  CI created 05:56:06, cancelled 05:56:23 (17s)
 *   f1c0038d  2026-08-07  CI created 19:41:35, cancelled 19:43:37 (2m)
 *
 * Those are every `Wait for CI` failure in the last 30 deploy runs — three
 * for three, one mechanism. 0e170179 is the cost worth naming: a 46-package
 * production-dependency bump that merged to `main` and never reached the
 * running services.
 *
 * The recovery is `gh run rerun <id>` rather than `gh workflow run ci.yml`.
 * A rerun re-executes against the exact commit the deploy is gated on; a
 * dispatch runs against whatever the branch points at *now*, which on a busy
 * `main` is a different tree. Deploying a commit whose CI evidence came from
 * a different commit is worse than not deploying.
 *
 * Only `cancelled` is recoverable here. `absent` is deliberately NOT — a
 * deploy starts on the same push that starts CI, so "no run yet" is the
 * normal first-few-seconds state, and re-dispatching into it would race the
 * real run. The existing wait step already handles slow-to-appear correctly.
 *
 * `absent` on a `workflow_dispatch` run is a different animal, and #5663 is
 * about it: `deploy-services.yml`'s `workflow_dispatch` trigger is the
 * documented recovery path for a stuck deploy (docs/runbooks/
 * deploys-unhealthy.md), and it typically fires well after the triggering
 * push — most often because no `push`-event workflow run exists for this
 * commit at all. It is NOT `ci.yml`'s `paths-ignore`: that list excludes only
 * `*.png`, `.gitignore`, and `LICENSE` (`docs/**`/`**.md` were deliberately
 * removed by #4664, specifically so a docs-only push still runs CI). The
 * real cause, measured on #5663's own cited commit (`893d6346c`, merged via
 * #5657 by `app/github-actions`): this repo's `GITHUB_TOKEN` anti-recursion
 * trap. GitHub does not fire a `push` event for a commit whose merge was
 * authored by the default `GITHUB_TOKEN`, so a `GITHUB_TOKEN`-merged
 * automation PR — most often a docs-only or metrics-only one — reaches
 * `main` with zero CI runs of any kind. No run for that SHA will EVER
 * appear, no matter how long the wait step polls, so burning its 30-minute
 * discovery timeout only delays the same failure. `shouldFailFast` below is
 * scoped to `workflow_dispatch` specifically so a `push`-triggered run keeps
 * waiting exactly as it does today — that case's `absent` really is
 * transient.
 *
 * Circuit breaker interaction: a `Wait for CI` failure used to count toward
 * `circuit-breaker.yml`'s consecutive-failure streak, which made this
 * recovery path self-amplifying — failing it twice in a row was enough to
 * re-trip the very breaker it was meant to clear. #5662 closed that
 * specific amplifier by having `circuit-breaker-deploy-failures.mjs` read
 * the `Deploy API Services` job's own conclusion (`skipped`, not `failure`,
 * whenever `ci-gate` fails before that job runs) instead of the run's
 * overall conclusion — so failing fast here, like every other `Wait for CI`
 * failure, does not feed the counter. That fact lives in a different file;
 * it is restated here because a future edit to either could quietly reopen
 * the amplification.
 */

/** Every state a ref's CI runs can collapse to. */
export const CI_RUN_STATES = ["absent", "running", "success", "failed", "cancelled"];

/**
 * Collapse every CI run recorded for one commit into a single state.
 *
 * Order is by outcome, not recency, so a rerun that succeeds after a
 * cancellation reports `success` and a second rerun is never issued.
 *
 * @param {Array<{status?: string, conclusion?: string|null}>} runs
 * @returns {"absent"|"running"|"success"|"failed"|"cancelled"}
 */
export function classifyCiRun(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return "absent";

  const conclusions = runs.map((run) => run?.conclusion ?? null);
  const statuses = runs.map((run) => run?.status ?? null);

  if (conclusions.includes("success")) return "success";
  if (statuses.some((s) => s === "queued" || s === "in_progress" || s === "waiting")) {
    return "running";
  }
  if (conclusions.some((c) => c === "failure" || c === "timed_out")) return "failed";
  if (conclusions.includes("cancelled")) return "cancelled";
  return "absent";
}

/**
 * Whether this state can be recovered by re-running CI on the same commit.
 *
 * `cancelled` alone. See the module header for why `absent` is excluded.
 *
 * @param {string} state
 */
export function shouldRerun(state) {
  return state === "cancelled";
}

/**
 * The run to re-execute: the most recent cancelled one.
 *
 * @param {Array<{databaseId?: number, conclusion?: string|null}>} runs
 * @returns {number|null}
 */
export function rerunTarget(runs) {
  if (!Array.isArray(runs)) return null;
  const cancelled = runs.find((run) => run?.conclusion === "cancelled");
  return cancelled?.databaseId ?? null;
}

/**
 * Whether the wait step should be skipped entirely and the job failed
 * immediately, instead of burning `checks-discovery-timeout` on a run that
 * will never appear. See the module header (#5663) for the full rationale
 * and the circuit-breaker interaction.
 *
 * Deliberately narrow in two ways. First, only `absent` + `workflow_dispatch`
 * — every other state keeps today's behaviour exactly, so this can never let
 * a commit whose CI genuinely failed, or one still running, skip the wait.
 * Second, `hasCheckRuns` must be the explicit boolean `false` — a positive,
 * independently-verified confirmation that no check run exists for this SHA
 * either. `gh run list --commit <sha>` (which produces `state`) is
 * documented-unreliable: it has returned `[]` for over an hour on real
 * squash-merge commits while the checks API already reported `Build:
 * success` on the same SHA — exactly the window a recovery dispatch is
 * likely to land in. Treating `state === "absent"` alone as sufficient would
 * turn that lag into a false, hard failure on a commit that would otherwise
 * have deployed. `undefined`/`null` (the cross-check was skipped, or itself
 * failed) must NOT be treated as "verified empty" — fail open on
 * uncertainty, same as every other best-effort step in this module.
 *
 * @param {string} state
 * @param {string|null|undefined} triggerEvent - `github.event_name`
 * @param {boolean|null|undefined} hasCheckRuns - whether a check run (e.g.
 *   `Build`) exists for this SHA, per the checks API — `false` only when
 *   that was actually queried and came back empty
 * @returns {boolean}
 */
export function shouldFailFast(state, triggerEvent, hasCheckRuns) {
  return state === "absent" && triggerEvent === "workflow_dispatch" && hasCheckRuns === false;
}

/**
 * Parse the CLI's `hasCheckRuns` argument into the tri-state `shouldFailFast`
 * expects: `"true"` -> `true`, `"false"` -> `false`, anything else
 * (missing, empty) -> `undefined` ("unverified", never "verified empty").
 *
 * @param {string|undefined} arg
 * @returns {boolean|undefined}
 */
export function parseHasCheckRuns(arg) {
  if (arg === "true") return true;
  if (arg === "false") return false;
  return undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = JSON.parse(process.argv[2] ?? "[]");
  const triggerEvent = process.argv[3] ?? "";
  const hasCheckRuns = parseHasCheckRuns(process.argv[4]);
  const state = classifyCiRun(runs);
  process.stdout.write(
    `${JSON.stringify({
      state,
      rerun: shouldRerun(state),
      runId: rerunTarget(runs),
      failFast: shouldFailFast(state, triggerEvent, hasCheckRuns),
    })}\n`
  );
}
