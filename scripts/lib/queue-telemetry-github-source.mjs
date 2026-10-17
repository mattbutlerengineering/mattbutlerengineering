/**
 * REST-only GitHub source for the queue-telemetry reconciler.
 *
 * Returns the facts `reconcileTelemetryRow` consumes. Uses `gh api` REST
 * paths only: GraphQL-backed `gh pr/issue` subcommands answer HTTP 403 in
 * Claude Code Remote sessions (gotchas.md § Claude Code Remote).
 */

import { execFileSync } from "node:child_process";

// `Review gate (inline): **PASS 9/10** — ...` -- the verdict is the first
// bold token after the "Review gate" label, so "tests PASS" never matches.
const VERDICT_RE = /Review gate[^*\n]*\*\*\s*(PASS|FLAG)\b/gi;

/**
 * @param {string[]} commentBodies
 * @returns {"pass"|"flag"|null} the LAST verdict (a retry re-reviews)
 */
export function parseReviewerVerdict(commentBodies) {
  let verdict = null;
  for (const body of commentBodies ?? []) {
    if (typeof body !== "string") continue;
    for (const m of body.matchAll(VERDICT_RE)) verdict = m[1].toLowerCase();
  }
  return verdict;
}

/**
 * Did `CI Gate` pass on the PR's FIRST head SHA? Pass only that SHA's data.
 * CI Gate is published as a check run and a commit status (#4025); any
 * failure wins, since a first pass that needed a rerun was not a first pass.
 *
 * @param {{ checkRuns?: object[], statuses?: object[] }} input
 * @returns {boolean|null} null when neither source has a CI Gate result
 */
export function ciGateFirstPass({ checkRuns = [], statuses = [] } = {}) {
  const results = [
    ...checkRuns
      .filter((c) => c?.name === "CI Gate" && c.status !== "in_progress")
      .map((c) => c.conclusion),
    ...statuses.filter((s) => s?.context === "CI Gate").map((s) => s.state),
  ].filter((r) => typeof r === "string" && r !== "pending");
  if (results.length === 0) return null;
  if (results.some((r) => r === "failure" || r === "error" || r === "timed_out")) return false;
  return results.some((r) => r === "success") ? true : null;
}

function defaultGhApi(path) {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf-8" }));
}

const REPO = "repos/{owner}/{repo}";

/**
 * @param {number} prNumber
 * @param {{ ghApi?: (path: string) => any }} [opts] - injected REST reader
 * @returns {Promise<object>|object} never throws; `{ error }` on failure
 */
export function fetchPrFacts(prNumber, { ghApi = defaultGhApi } = {}) {
  try {
    const pr = ghApi(`${REPO}/pulls/${prNumber}`);
    const state = pr.merged_at ? "MERGED" : pr.state === "open" ? "OPEN" : "CLOSED";

    const commits = ghApi(`${REPO}/pulls/${prNumber}/commits?per_page=1`);
    const firstSha = Array.isArray(commits) ? commits[0]?.sha : undefined;
    let firstPass = null;
    if (firstSha) {
      const checks = ghApi(`${REPO}/commits/${firstSha}/check-runs?per_page=100`);
      const statuses = ghApi(`${REPO}/commits/${firstSha}/statuses?per_page=100`);
      firstPass = ciGateFirstPass({ checkRuns: checks?.check_runs ?? [], statuses });
    }

    const comments = ghApi(`${REPO}/issues/${prNumber}/comments?per_page=100`);
    return {
      state,
      mergedAt: pr.merged_at ?? null,
      ciGateFirstPass: firstPass,
      reviewerVerdict: parseReviewerVerdict((comments ?? []).map((c) => c.body)),
    };
  } catch (err) {
    const message = String(err?.message ?? err);
    return { error: /\b404\b|Not Found/i.test(message) ? "pr-not-found" : message };
  }
}
