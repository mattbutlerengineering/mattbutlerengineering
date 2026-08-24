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

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = JSON.parse(process.argv[2] ?? "[]");
  const state = classifyCiRun(runs);
  process.stdout.write(
    `${JSON.stringify({ state, rerun: shouldRerun(state), runId: rerunTarget(runs) })}\n`
  );
}
