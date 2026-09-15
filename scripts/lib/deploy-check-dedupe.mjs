import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Stable (non-commit-keyed) dedupe identity for `.github/workflows/post-deploy-check.yml`'s
 * two auto-filing steps.
 *
 * Both steps used to build their `--dedupe-key`/`--contains` out of the triggering
 * commit's short SHA. Since the underlying failure (a pre-existing routing defect, a
 * deploy-propagation poll timeout) is rarely specific to the commit that happened to
 * trigger the probe, a SHA-keyed identity can never match itself on the next commit —
 * every run refiles a "new" issue for the same root cause (#5189; see #5123-#5153 and
 * #5168-#5231 for the duplicate chains this produced).
 *
 * `apiSurfaceFailureSignature()` and `POST_DEPLOY_UNVERIFIED_DEDUPE_KEY` are the pure,
 * unit-tested identities the workflow embeds in its issue title/`--contains` instead —
 * see `.github/workflows/post-deploy-check.yml` for how they're wired into
 * `scripts/lib/file-issue-cli.mjs`.
 */

/**
 * @typedef {{ name: string, state: string }} ProbeResult
 */

/**
 * Parse `scripts/check-api-surface-invariants.mjs`'s one-JSON-line-per-probe stdout.
 * Lines that aren't valid JSON (a crash's stack trace, the trailing prose summary)
 * are silently skipped rather than treated as an error — the probe log is a mix of
 * JSON lines and human-readable lines by design.
 *
 * @param {string} logText
 * @returns {ProbeResult[]}
 */
export function parseProbeLog(logText) {
  const results = [];
  for (const line of logText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.name === "string" && typeof parsed.state === "string") {
        results.push({ name: parsed.name, state: parsed.state });
      }
    } catch {
      // Not a probe JSON line — ignore.
    }
  }
  return results;
}

/** Returned when a probe log carries no parseable probe result at all (e.g. the probe
 * script crashed before printing anything). Deliberately not commit- or time-based, so
 * repeated total-failure runs still dedupe against each other. */
export const UNPARSEABLE_LOG_SIGNATURE = "unparseable-probe-log";

/**
 * Stable signature for "which probes failed, and how" — independent of the commit
 * that triggered the run and of the order probes happened to print in.
 *
 * @param {string} logText raw stdout from check-api-surface-invariants.mjs
 * @returns {string}
 */
export function apiSurfaceFailureSignature(logText) {
  const failing = parseProbeLog(logText).filter((probe) => probe.state !== "ok");
  if (failing.length === 0) return UNPARSEABLE_LOG_SIGNATURE;

  return failing
    .map((probe) => `${probe.name}:${probe.state}`)
    .sort()
    .join("+");
}

/**
 * The full dedupe key for the "API surface invariant breach" issue-filing step.
 * Prefixed so it can never collide with an unrelated dedupe-key family sharing the
 * `ci-fix` label.
 *
 * @param {string} logText
 * @returns {string}
 */
export function apiSurfaceInvariantsDedupeKey(logText) {
  return `api-surface-invariants:${apiSurfaceFailureSignature(logText)}`;
}

/**
 * Dedupe key for "Post-deploy verification could not confirm deploy". Deliberately a
 * fixed string with no SHA or timestamp component: a propagation-poll timeout carries
 * no commit-specific information worth splitting duplicates on (the workflow's own
 * issue body says so explicitly — "this is NOT proof of a regression").
 */
export const POST_DEPLOY_UNVERIFIED_DEDUPE_KEY = "post-deploy-check-unverified";

/**
 * Shell-callable front door, in the same spirit as `scripts/lib/file-issue-cli.mjs` —
 * a workflow `run:` block is plain bash, so the dedupe identity has to cross that
 * boundary as a CLI rather than an import.
 *
 * Usage:
 *   node scripts/lib/deploy-check-dedupe.mjs api-surface <probe-log-path>
 *     -> prints {"signature": "...", "dedupeKey": "..."} to stdout
 *   node scripts/lib/deploy-check-dedupe.mjs post-deploy-unverified-key
 *     -> prints the fixed POST_DEPLOY_UNVERIFIED_DEDUPE_KEY string to stdout
 *
 * @param {string[]} argv
 * @param {{ readFile: (path: string) => string }} deps
 */
export function runCli(argv, deps) {
  const [command, ...rest] = argv;

  if (command === "api-surface") {
    const logPath = rest[0];
    if (!logPath) throw new Error("api-surface requires a probe-log path argument");
    const logText = deps.readFile(logPath);
    process.stdout.write(
      JSON.stringify({
        signature: apiSurfaceFailureSignature(logText),
        dedupeKey: apiSurfaceInvariantsDedupeKey(logText),
      })
    );
    return;
  }

  if (command === "post-deploy-unverified-key") {
    process.stdout.write(POST_DEPLOY_UNVERIFIED_DEDUPE_KEY);
    return;
  }

  throw new Error(`Unknown command: ${command ?? "(none)"}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runCli(process.argv.slice(2), {
    // A missing log (e.g. the probe step crashed before tee wrote anything)
    // is itself informative -- fall back to the empty string rather than
    // throwing, so this step still files/comments instead of the workflow
    // failing before it can report anything.
    readFile: (path) => {
      try {
        return readFileSync(path, "utf-8");
      } catch {
        return "";
      }
    },
  });
}
