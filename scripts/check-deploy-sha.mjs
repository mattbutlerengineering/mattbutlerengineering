#!/usr/bin/env node
/**
 * scripts/check-deploy-sha.mjs
 *
 * Polls a live URL's `<meta name="build-id">` tag until it matches an
 * expected short commit SHA, or a bounded attempt budget is exhausted.
 *
 * #5006: the old inline bash in post-deploy-check.yml's "Poll for deploy to
 * land" step warned on timeout (`::warning::`) and then fell straight through
 * to running Playwright smoke tests unconditionally. That produced a green
 * "Post-Deploy Check" in the one failure mode it exists to catch: a deploy
 * that never propagated, verified by smoke tests that actually ran against
 * the *previous* build. `sha_confirmed` was read later only for report text
 * -- it gated nothing.
 *
 * The exit code IS the gate here: `pollForDeploy` returns a `confirmed` field
 * that is one of "confirmed" | "timeout" | "skipped" (no expected SHA --
 * manual dispatch has nothing to confirm), and the CLI below exits 1 only on
 * "timeout". Callers must not swallow that exit code -- see
 * post-deploy-check.yml's "Poll for deploy to land" step for how it's used
 * to skip the smoke-test step and fail the job distinguishably from a
 * confirmed-and-healthy run.
 *
 * `--trigger-name` (#5153 follow-up): passed alongside `--expected-sha`, this
 * routes the raw head SHA through `resolveExpectedSha()` before polling --
 * see that function's doc comment for why only "Deploy Static Sites" ever
 * gets a real SHA to confirm.
 *
 * Usage:
 *   node scripts/check-deploy-sha.mjs --url <url> [--expected-sha <sha>] [--trigger-name <name>] [--max-attempts N] [--sleep-secs N]
 *
 * Prints one JSON line to stdout:
 *   {"confirmed":"confirmed"|"timeout"|"skipped","liveBuildId":string|null,"attempts":number}
 */

import { fileURLToPath } from "node:url";

/** @typedef {"confirmed"|"timeout"|"skipped"} DeployConfirmation */

/**
 * @param {string} html
 * @returns {string|null}
 */
export function extractBuildId(html) {
  const match = /<meta name="build-id" content="([^"]+)"/.exec(html);
  return match ? match[1] : null;
}

/**
 * Pure comparison of the live build id against the expected short SHA --
 * compares only the first 7 characters of each, matching the short-SHA
 * convention used throughout this repo's workflows.
 *
 * @param {{ expectedShortSha: string|null, liveBuildId: string|null }} args
 * @returns {boolean}
 */
export function isBuildConfirmed({ expectedShortSha, liveBuildId }) {
  if (!expectedShortSha || !liveBuildId) return false;
  return liveBuildId.slice(0, 7) === expectedShortSha.slice(0, 7);
}

/**
 * The only `workflow_run` trigger whose deploy actually updates the polled
 * `<meta name="build-id">` tag on `https://mattbutlerengineering.com/`.
 * `deploy-static.yml` sets `VITE_BUILD_ID: ${{ github.sha }}` and is the sole
 * writer of that tag; "Deploy Services" and "Pulumi Deploy" ship backend/
 * infra changes that never touch the marketing build.
 *
 * Root cause behind the recurring "Post-deploy verification could not
 * confirm deploy" flake (#5098, #5123, #5124, #5133, #5134, #5153 -- six
 * occurrences, all after the poll budget was already doubled to 48x15s=12min
 * for #5006): every one of those issues was filed on a "Deploy Services" or
 * "Pulumi Deploy" trigger, none on "Deploy Static Sites". Polling the
 * marketing homepage for a backend/infra commit's SHA is a category error,
 * not a propagation delay -- no amount of budget widening makes it succeed.
 */
const SHA_VERIFIABLE_TRIGGER = "Deploy Static Sites";

/**
 * @param {string|null} [triggerName]
 * @returns {boolean}
 */
export function isShaVerifiableTrigger(triggerName) {
  return triggerName === SHA_VERIFIABLE_TRIGGER;
}

/**
 * Decides the SHA `pollForDeploy` should actually confirm against, given the
 * `workflow_run` event that triggered this check. Only "Deploy Static Sites"
 * ever gets a real SHA to confirm; every other trigger (or no trigger at all,
 * i.e. manual `workflow_dispatch`) resolves to `null`, which `pollForDeploy`
 * already treats as "skipped" -- run smoke tests against whatever's live
 * without waiting on a match that can never happen.
 *
 * @param {{ triggerName: string|null, headSha: string|null }} args
 * @returns {string|null}
 */
export function resolveExpectedSha({ triggerName, headSha }) {
  if (!headSha) return null;
  return isShaVerifiableTrigger(triggerName) ? headSha : null;
}

/**
 * @param {string} url
 * @param {typeof fetch} fetchFn
 * @returns {Promise<string|null>}
 */
async function fetchBuildId(url, fetchFn) {
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(10000) });
    const html = await response.text();
    return extractBuildId(html);
  } catch {
    return null;
  }
}

/**
 * Polls `url` up to `maxAttempts` times, `sleepSecs` apart, until its
 * build-id matches `expectedShortSha`.
 *
 * @param {{
 *   url: string,
 *   expectedShortSha: string|null,
 *   maxAttempts?: number,
 *   sleepSecs?: number,
 *   fetchFn?: typeof fetch,
 *   sleepFn?: (ms: number) => Promise<void>,
 * }} args
 * @returns {Promise<{ confirmed: DeployConfirmation, liveBuildId: string|null, attempts: number }>}
 */
export async function pollForDeploy({
  url,
  expectedShortSha,
  maxAttempts = 48,
  sleepSecs = 15,
  fetchFn = fetch,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!expectedShortSha) {
    return { confirmed: "skipped", liveBuildId: null, attempts: 0 };
  }

  let liveBuildId = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    liveBuildId = await fetchBuildId(url, fetchFn);
    if (isBuildConfirmed({ expectedShortSha, liveBuildId })) {
      return { confirmed: "confirmed", liveBuildId, attempts: attempt };
    }
    if (attempt < maxAttempts) {
      await sleepFn(sleepSecs * 1000);
    }
  }
  return { confirmed: "timeout", liveBuildId, attempts: maxAttempts };
}

function readFlag(args, flag) {
  const idx = args.indexOf(flag);
  return idx === -1 ? undefined : args[idx + 1];
}

// CLI entry point: poll for the deploy and print the JSON result. Exit code
// is the gate -- see the header comment above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const url = readFlag(args, "--url");
  const triggerName = readFlag(args, "--trigger-name") || null;
  const expectedShortSha = resolveExpectedSha({
    triggerName,
    headSha: readFlag(args, "--expected-sha") || null,
  });
  const maxAttempts = Number(readFlag(args, "--max-attempts") ?? 48);
  const sleepSecs = Number(readFlag(args, "--sleep-secs") ?? 15);

  if (!url) {
    console.error(
      "Usage: node scripts/check-deploy-sha.mjs --url <url> [--expected-sha <sha>] [--max-attempts N] [--sleep-secs N]"
    );
    process.exit(1);
  }

  const result = await pollForDeploy({ url, expectedShortSha, maxAttempts, sleepSecs });
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exit(result.confirmed === "timeout" ? 1 : 0);
}
