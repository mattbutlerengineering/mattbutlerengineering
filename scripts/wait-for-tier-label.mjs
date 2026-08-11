#!/usr/bin/env node

/**
 * wait-for-tier-label.mjs — polls a PR for a tier:* label after dispatching
 * `tier-classifier.yml` via `workflow_dispatch` (#4070).
 *
 * `workflow_dispatch` is fire-and-forget: the dispatch call returns as soon
 * as GitHub accepts the request, not once the run (and its label write)
 * finishes. Without waiting, the "Enable auto-merge" step that used to run
 * right after dispatch would read the PR's labels before tier-classifier
 * had a chance to add `tier:*`, and `isAutomationAutoMergeEligible`'s
 * fail-closed check would (correctly, but pointlessly) refuse every time —
 * the exact bug this issue fixes.
 *
 * `hasTierLabel` and `pollForTierLabel` are pure/injectable and unit-tested
 * without gh/network (scripts/__tests__/wait-for-tier-label.test.mjs). The
 * CLI below is a thin caller the four producer workflows invoke right after
 * dispatching tier-classifier.yml, before their "Enable auto-merge" step.
 *
 * Usage:
 *   node scripts/wait-for-tier-label.mjs --pr 4080 [--timeout-ms 120000] [--interval-ms 5000]
 */

import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { TIER_LABEL_PREFIX } from "./merge-queue-eligibility.mjs";

/**
 * @param {string[]} [labelNames]
 * @returns {boolean}
 */
export function hasTierLabel(labelNames = []) {
  return labelNames.some((label) => label.startsWith(TIER_LABEL_PREFIX));
}

/**
 * Polls `fetchLabels` until it returns a label list containing a tier:*
 * label, or `timeoutMs` elapses. Injected `sleep`/`now` keep this testable
 * without real timers or network calls.
 *
 * @param {object} deps
 * @param {() => Promise<string[]>} deps.fetchLabels
 * @param {(ms: number) => Promise<void>} deps.sleep
 * @param {() => number} [deps.now]
 * @param {number} [deps.timeoutMs]
 * @param {number} [deps.intervalMs]
 * @returns {Promise<{ landed: boolean, labelNames: string[] }>}
 */
export async function pollForTierLabel({
  fetchLabels,
  sleep,
  now = Date.now,
  timeoutMs = 120_000,
  intervalMs = 5_000,
}) {
  const deadline = now() + timeoutMs;
  let labelNames = await fetchLabels();
  while (!hasTierLabel(labelNames) && now() < deadline) {
    await sleep(intervalMs);
    labelNames = await fetchLabels();
  }
  return { landed: hasTierLabel(labelNames), labelNames };
}

function readFlag(args, name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const pr = readFlag(args, "--pr");
  if (!pr) {
    console.error(
      "Usage: wait-for-tier-label.mjs --pr <number> [--timeout-ms N] [--interval-ms N]"
    );
    process.exit(1);
  }
  const timeoutMs = Number(readFlag(args, "--timeout-ms", "120000"));
  const intervalMs = Number(readFlag(args, "--interval-ms", "5000"));

  const fetchLabels = async () =>
    JSON.parse(
      execFileSync("gh", ["pr", "view", pr, "--json", "labels", "-q", "[.labels[].name]"], {
        encoding: "utf-8",
      })
    );
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const result = await pollForTierLabel({ fetchLabels, sleep, timeoutMs, intervalMs });
  console.log(JSON.stringify(result));
  if (!result.landed) {
    console.log(
      `::warning::tier:* label did not land on PR #${pr} within ${timeoutMs}ms — Enable auto-merge will fail closed this run`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`[wait-for-tier-label] Error: ${err.message}\n`);
    process.exit(1);
  });
}
