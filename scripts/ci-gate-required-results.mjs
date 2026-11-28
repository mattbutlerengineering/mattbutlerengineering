#!/usr/bin/env node

/**
 * ci-gate-required-results.mjs — decide whether `ci.yml`'s `CI Gate` job
 * passes, from the results of every job it `needs`.
 *
 * `CI Gate` is the sole required status check on `main` and drives
 * auto-merge, so this decision is a security boundary. It used to live
 * inline in ci.yml as a loop that failed only on `failure` or `cancelled`,
 * which is fail-OPEN: any other result passed. Measured 2026-10-05 during a
 * GitHub Actions incident — PR #6077, run 37363956419 attempt 2: prepare,
 * hadolint, trivy and visual-tolerance-check came back `abandoned` (runners
 * never acquired), lint/typecheck/build/test cascaded to `skipped`, and
 * `CI Gate` published success with nothing verified.
 *
 * This module is fail-CLOSED:
 *
 *   1. Only `success` and `skipped` pass. Everything else — failure,
 *      cancelled, abandoned, neutral, timed_out, action_required, stale,
 *      empty, missing, anything GitHub invents later — fails.
 *   2. `skipped` stays allowed because it is legitimate: docs-only PRs skip
 *      the whole Build chain (prepare sets has_code=false), and jobs like
 *      a11y-attribution and containers (and the PR-only steps of
 *      repo-checks / migrations) skip by their own `if:` conditions.
 *   3. Because a skipped root cascades `skipped` to every dependent (which
 *      reads identically to a legitimate skip), the root of the chain is
 *      checked explicitly:
 *        - prepare has no `if:` (it absorbed the old detect-changes job,
 *          #10064), so it must be `success`;
 *        - its has_code output must be exactly "true" or "false";
 *        - every Build-chain job gates on `has_code == 'true'`, so when
 *          has_code is "true" each must be `success`. A skip there would
 *          mean a broken or mistyped `if:` dropped a check. When has_code is
 *          "false" they legitimately skip (docs-only).
 *
 * The workflow passes `${{ toJSON(needs) }}` rather than a hand-listed set
 * of env vars, so a job added to `needs:` is covered automatically instead
 * of silently escaping the gate.
 *
 * Usage (in ci.yml):
 *   NEEDS_JSON='${{ toJSON(needs) }}' node scripts/ci-gate-required-results.mjs
 * Exit 0 = gate passes, 1 = gate fails (reasons printed as ::error::).
 */

import { fileURLToPath } from "node:url";

/** The only job results that let `CI Gate` pass. */
export const PASSING_RESULTS = new Set(["success", "skipped"]);

const ROOT_JOB = "prepare";

/** ci.yml jobs gated only on `needs.prepare.outputs.has_code == 'true'`. */
export const BUILD_CHAIN_JOBS = [
  "static-checks",
  "repo-checks",
  "build",
  "test",
  "migrations",
  "rls-integration",
];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkRootOfChain(needs) {
  const root = needs[ROOT_JOB];
  if (!isPlainObject(root)) return [`${ROOT_JOB} is missing from needs`];

  const errors = [];
  if (root.result !== "success") {
    errors.push(`${ROOT_JOB} must succeed (it has no if:), got ${JSON.stringify(root.result)}`);
  }

  const hasCode = root.outputs?.has_code;
  if (hasCode !== "true" && hasCode !== "false") {
    errors.push(`${ROOT_JOB} has_code must be "true" or "false", got ${JSON.stringify(hasCode)}`);
  } else if (hasCode === "true") {
    for (const job of BUILD_CHAIN_JOBS) {
      const result = needs[job]?.result;
      if (result !== "success") {
        errors.push(`has_code is "true" so ${job} must succeed, got ${JSON.stringify(result)}`);
      }
    }
  }
  return errors;
}

/**
 * Pure gate decision over a `toJSON(needs)`-shaped object.
 *
 * @param {unknown} needs - `{ [job]: { result, outputs } }`.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function evaluateRequiredResults(needs) {
  if (!isPlainObject(needs) || Object.keys(needs).length === 0) {
    return { ok: false, errors: ["needs context is empty or not an object"] };
  }

  const resultErrors = Object.entries(needs)
    .filter(([, value]) => !PASSING_RESULTS.has(value?.result))
    .map(
      ([job, value]) => `${job} result ${JSON.stringify(value?.result)} is not success or skipped`
    );

  const errors = [...resultErrors, ...checkRootOfChain(needs)];
  return { ok: errors.length === 0, errors };
}

function parseNeeds(raw) {
  try {
    return JSON.parse(raw ?? "");
  } catch {
    return null;
  }
}

function main() {
  const needs = parseNeeds(process.env.NEEDS_JSON);
  if (isPlainObject(needs)) {
    for (const [job, value] of Object.entries(needs)) {
      process.stdout.write(`${job}=${value?.result}\n`);
    }
  }

  const { ok, errors } = evaluateRequiredResults(needs);
  // #10188: drafts skip `prepare` on purpose. The verdict is unchanged (fail
  // closed); the hint only says why, so a red gate on a draft is not chased.
  if (process.env.IS_DRAFT_PR === "true" && needs?.[ROOT_JOB]?.result === "skipped") {
    process.stdout.write(
      "::notice::Draft PR: CI is skipped by design (#10188). Mark the PR ready for review to run it.\n"
    );
  }
  for (const error of errors) process.stdout.write(`::error::${error}\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
