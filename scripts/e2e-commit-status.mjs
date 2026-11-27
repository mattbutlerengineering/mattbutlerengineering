#!/usr/bin/env node

/**
 * e2e-commit-status.mjs - map an advisory E2E job result to a commit status
 * (#10025).
 *
 * `e2e.yml` runs by `workflow_dispatch` after `CI Gate` passes, and check runs
 * from a dispatched run are invisible to `statusCheckRollup` (#4023). Commit
 * statuses are not (#4025, `scripts/ci-gate-commit-status.mjs`), so each suite
 * publishes one on the PR head SHA and its result shows on the PR.
 *
 * Fails closed: `cancelled` and anything unrecognized map to `error`, never
 * `success`, so an interrupted run cannot leave a green status.
 *
 * Usage:
 *   node scripts/e2e-commit-status.mjs state --result success
 *   node scripts/e2e-commit-status.mjs description --suite Hospitality --result skipped
 */

import { fileURLToPath } from "node:url";

/** Result of a job, or `pending` for "about to run". */
const MAP = {
  pending: { state: "pending", text: "running" },
  success: { state: "success", text: "passed" },
  failure: { state: "failure", text: "failed" },
  skipped: { state: "success", text: "skipped: no relevant changes" },
  cancelled: { state: "error", text: "cancelled" },
};

const FALLBACK = { state: "error", text: "no result" };

/**
 * @param {string} result e.g. "success", "failure", "cancelled", "skipped", "pending".
 * @returns {"pending" | "success" | "failure" | "error"}
 */
export function mapResultToState(result) {
  return (MAP[result] ?? FALLBACK).state;
}

/**
 * @param {string} suite e.g. "Hospitality".
 * @param {string} result as for {@link mapResultToState}.
 * @returns {string} Commit-status description (the API caps it at 140 chars).
 */
export function describeResult(suite, result) {
  return `${suite} E2E ${(MAP[result] ?? FALLBACK).text}`;
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? (args[idx + 1] ?? "") : "";
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  const result = readFlag(rest, "--result");
  if (subcommand === "state") {
    process.stdout.write(`${mapResultToState(result)}\n`);
    return;
  }
  if (subcommand === "description") {
    process.stdout.write(`${describeResult(readFlag(rest, "--suite"), result)}\n`);
    return;
  }
  console.error(
    "Usage: e2e-commit-status.mjs state --result <r> | description --suite <name> --result <r>"
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
