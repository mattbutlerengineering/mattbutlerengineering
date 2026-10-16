#!/usr/bin/env node

/**
 * main-strictness.mjs — fail-closed probe for whether `main`'s branch
 * protection currently has `strict` required-status-checks on (WO-28,
 * ADR-095 amending ADR-023).
 *
 * `strict` is repo *state*, not repo code — it can flip with zero diff (see
 * gotchas.md § CI), so the zone-batch selector's `strictMain` option must
 * never be hardcoded from a point-in-time measurement. `classifyMainStrictness`
 * is the pure decision, same discipline as `classifyBuildFreshness`: only a
 * successfully parsed response whose `strict` field is the literal boolean
 * `false` yields `strictMain: false`. Everything else — a `gh api` error, a
 * non-JSON body, a missing `strict` field, or a non-boolean/non-`false`
 * value — fails closed to `strictMain: true` (today's one-per-zone
 * behaviour), because trusting an unproven "not strict" would let the
 * selector admit a batch main's protection can't actually support.
 *
 * Usage (compose hook, once per iteration):
 *   node scripts/main-strictness.mjs check
 *   # prints {"strictMain":boolean,"reason":string} to stdout
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

/**
 * Pure: classify `main`'s strictness from a `gh api
 * repos/{owner}/{repo}/branches/main/protection/required_status_checks`
 * call's raw stdout and (if the call failed) its error.
 *
 * @param {string|null|undefined} output raw stdout, expected JSON
 * @param {unknown} error truthy if the `gh api` call itself failed
 * @returns {{ strictMain: boolean, reason: string }}
 */
export function classifyMainStrictness(output, error) {
  if (error) {
    return {
      strictMain: true,
      reason: "gh api call failed — failing closed to strictMain:true",
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return {
      strictMain: true,
      reason: "response was not valid JSON — failing closed to strictMain:true",
    };
  }

  if (parsed === null || typeof parsed !== "object" || !("strict" in parsed)) {
    return {
      strictMain: true,
      reason: "response had no `strict` field — failing closed to strictMain:true",
    };
  }

  if (parsed.strict === false) {
    return {
      strictMain: false,
      reason: "main's required_status_checks.strict is literally false",
    };
  }

  return {
    strictMain: true,
    reason: `main's required_status_checks.strict was ${JSON.stringify(parsed.strict)}, not the literal false`,
  };
}

// ---------------------------------------------------------------------------
// Thin CLI wrapper
// ---------------------------------------------------------------------------

function run() {
  if (process.argv[2] !== "check") {
    console.error("Usage: main-strictness.mjs check");
    process.exit(1);
  }

  let output = null;
  let error = null;
  try {
    output = execFileSync(
      "gh",
      ["api", "repos/{owner}/{repo}/branches/main/protection/required_status_checks"],
      { encoding: "utf-8" }
    );
  } catch (err) {
    error = err;
  }

  console.log(JSON.stringify(classifyMainStrictness(output, error)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
