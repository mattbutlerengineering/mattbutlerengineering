#!/usr/bin/env node

/**
 * ci-gate-status.mjs — classify a PR's `CI Gate` state from its
 * `statusCheckRollup` (#3969).
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
 * conflated with `green` — see the `.claude/skills/implement-queue/
 * SKILL.md` Phase 2 worker→train boundary, step 1, for how the orchestrator
 * consumes it (recover via `gh workflow run ci.yml --ref <branch>`, the
 * same `workflow_dispatch` escape hatch `check-ci-dispatch.mjs` already
 * requires every PR-opening workflow to use).
 *
 * Pure and network-free: takes an already-fetched `statusCheckRollup` array
 * (from `gh pr view --json statusCheckRollup`) and never shells out itself,
 * so it's unit-testable without mocking `gh`. The CLI below is a thin caller
 * that fetches the rollup and prints the classification as JSON.
 *
 * Usage:
 *   node scripts/ci-gate-status.mjs check --pr <N>
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The sole required status check on `main` (green-main policy). */
export const CI_GATE_CHECK_NAME = "CI Gate";

/**
 * Pure classifier: given a PR's `statusCheckRollup` array, decide whether
 * its `CI Gate` check is green, failed, pending, or missing entirely.
 *
 * `gate-missing` is a distinct state from `green` — the caller (Phase 2's
 * worker→train boundary) must never enqueue a PR in this state; it must
 * dispatch CI and re-wait instead. Never throws: an unexpected input shape
 * (missing rollup, non-array) degrades to `gate-missing` rather than
 * propagating an error, since "I can't find CI Gate" is the correct
 * conclusion either way.
 *
 * @param {Array<{name?: string, status?: string, conclusion?: string|null}>} [statusCheckRollup]
 * @returns {{ state: "green"|"failed"|"pending"|"gate-missing", reason: string }}
 */
export function classifyCiGateStatus(statusCheckRollup) {
  const rollup = Array.isArray(statusCheckRollup) ? statusCheckRollup : [];
  const gate = rollup.find((check) => check?.name === CI_GATE_CHECK_NAME);

  if (!gate) {
    return {
      state: "gate-missing",
      reason: `no "${CI_GATE_CHECK_NAME}" check found on this SHA — CI likely never ran`,
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

/** CLI entry: fetches the rollup for `--pr <N>` and prints the classification. */
function run() {
  const args = process.argv.slice(3);
  const prIdx = args.indexOf("--pr");
  const prNumber = prIdx !== -1 ? args[prIdx + 1] : null;

  if (process.argv[2] !== "check" || !prNumber) {
    console.error("Usage: ci-gate-status.mjs check --pr <N>");
    process.exit(1);
  }

  const rollup = JSON.parse(
    execFileSync("gh", ["pr", "view", prNumber, "--json", "statusCheckRollup"], {
      encoding: "utf-8",
    })
  ).statusCheckRollup;

  console.log(JSON.stringify(classifyCiGateStatus(rollup)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
