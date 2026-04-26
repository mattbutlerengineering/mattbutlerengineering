/**
 * Agent PR outcome reader for ACMM behavioral signal (issue #647).
 *
 * ACMM previously satisfied `acmm:pr-acceptance-metric` by detecting that a
 * metrics script *exists*. This module reads the actual numbers: did agent
 * PRs land? Were they reverted? How long did they take? Did humans rewrite
 * them before merge?
 *
 * Detection of "agent PR":
 *   - branch starts with one of `AGENT_BRANCH_PREFIXES`, OR
 *   - PR has the `has-pr` label (used by /issue-worker)
 *
 * Window: PRs created in the last 30 days. We compute:
 *   - `agent_pr_acceptance_rate_30d` = merged / (merged + closed_unmerged)
 *   - `agent_pr_revert_rate_30d`     = reverted_within_7d / merged
 *   - `agent_pr_median_time_to_merge_hours` (median, robust to outliers)
 *   - `agent_pr_human_touch_ratio`    = merged_with_human_commit / merged
 *
 * Open PRs are excluded from acceptance/merge time calculations.
 * Sample sizes <5 yield `insufficient_data: true` so callers can suppress
 * misleading percentages.
 *
 * Uses `execFileSync` (no shell) — same safe pattern as
 * `scripts/acmm/outputs/issues.js` and `scripts/acmm/backfill-metrics.js`.
 */

import { execFileSync } from "node:child_process";

const AGENT_BRANCH_PREFIXES = [
  "worktree-agent-",
  "agent-",
  "fix/agent-",
  "feat/agent-",
];
const AGENT_LABEL = "has-pr";
const WINDOW_DAYS = 30;
const REVERT_WINDOW_DAYS = 7;
const MIN_SAMPLE = 5;

/**
 * @typedef {Object} PrRecord
 * @property {number} number
 * @property {string} title
 * @property {string} headRefName       branch name
 * @property {string} state             "OPEN" | "CLOSED" | "MERGED"
 * @property {string} createdAt         ISO timestamp
 * @property {string | null} mergedAt   ISO timestamp or null
 * @property {string[]} labels          label names
 * @property {boolean} reverted_within_7d  enriched by IO layer
 * @property {boolean} human_touched    enriched by IO layer (non-author commits to branch)
 */

/**
 * Is this PR from an agent? Branch-prefix OR has-pr label.
 *
 * @param {Pick<PrRecord, "headRefName" | "labels">} pr
 */
export function isAgentPr(pr) {
  if (pr.labels?.includes(AGENT_LABEL)) return true;
  if (!pr.headRefName) return false;
  return AGENT_BRANCH_PREFIXES.some((p) => pr.headRefName.startsWith(p));
}

/**
 * Pure compute over a normalized PR list.
 *
 * @param {PrRecord[]} prs
 * @param {{ now?: Date, windowDays?: number, minSample?: number }} [opts]
 */
export function computePrOutcomes(prs, opts = {}) {
  const now = opts.now ?? new Date();
  const windowMs = (opts.windowDays ?? WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;
  const minSample = opts.minSample ?? MIN_SAMPLE;

  const inWindow = prs.filter((pr) => {
    const t = Date.parse(pr.createdAt);
    return Number.isFinite(t) && t >= cutoff && isAgentPr(pr);
  });

  const merged = inWindow.filter((pr) => pr.state === "MERGED" && pr.mergedAt);
  const closedUnmerged = inWindow.filter((pr) => pr.state === "CLOSED" && !pr.mergedAt);
  const open = inWindow.filter((pr) => pr.state === "OPEN");

  const decided = merged.length + closedUnmerged.length;
  const acceptanceRate = decided === 0 ? 0 : merged.length / decided;

  const reverted = merged.filter((pr) => pr.reverted_within_7d).length;
  const revertRate = merged.length === 0 ? 0 : reverted / merged.length;

  const mergeHours = merged
    .map((pr) => (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const medianHours = median(mergeHours);

  const humanTouched = merged.filter((pr) => pr.human_touched).length;
  const humanTouchRatio = merged.length === 0 ? 0 : humanTouched / merged.length;

  return {
    sample_size: inWindow.length,
    merged_count: merged.length,
    closed_unmerged_count: closedUnmerged.length,
    open_count: open.length,
    acceptance_rate_30d: acceptanceRate,
    revert_rate_30d: revertRate,
    median_time_to_merge_hours: medianHours,
    human_touch_ratio: humanTouchRatio,
    insufficient_data: inWindow.length < minSample,
  };
}

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Extract PR numbers referenced by a "Revert" commit message.
 * @param {string} message
 * @returns {number[]}
 */
export function extractRevertedPrNumbers(message) {
  if (!message?.startsWith("Revert ")) return [];
  const numbers = [];
  const re = /#(\d+)/g;
  let m;
  while ((m = re.exec(message)) !== null) {
    numbers.push(Number(m[1]));
  }
  return numbers;
}

/**
 * Fetch agent PRs and enrich with revert/human-touch flags.
 * Returns null on any tool failure so callers can detect "no signal".
 */
export function fetchAgentPrs(opts = {}) {
  const ghBin = opts.ghBin ?? "gh";
  const limit = opts.limit ?? 200;
  const windowDays = opts.windowDays ?? WINDOW_DAYS;
  const revertLookbackDays = windowDays + REVERT_WINDOW_DAYS;

  let allPrs;
  try {
    const stdout = execFileSync(
      ghBin,
      [
        "pr",
        "list",
        "--state",
        "all",
        "--limit",
        String(limit),
        "--json",
        "number,title,headRefName,state,createdAt,mergedAt,labels,author",
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    allPrs = JSON.parse(stdout);
  } catch {
    return null;
  }

  if (!Array.isArray(allPrs)) return null;

  const normalized = allPrs.map((pr) => ({
    number: Number(pr.number),
    title: String(pr.title ?? ""),
    headRefName: String(pr.headRefName ?? ""),
    state: String(pr.state ?? ""),
    createdAt: String(pr.createdAt ?? ""),
    mergedAt: pr.mergedAt ? String(pr.mergedAt) : null,
    labels: Array.isArray(pr.labels) ? pr.labels.map((l) => String(l.name ?? "")) : [],
    author: pr.author?.login ? String(pr.author.login) : "",
    reverted_within_7d: false,
    human_touched: false,
  }));

  const revertedSet = fetchRevertedPrNumbers({ sinceDays: revertLookbackDays });

  for (const pr of normalized) {
    if (revertedSet?.has(pr.number) && pr.mergedAt) {
      pr.reverted_within_7d = true;
    }
    if (pr.state === "MERGED") {
      pr.human_touched = prHasNonAuthorCommit(ghBin, pr.number, pr.author);
    }
  }

  return normalized;
}

function fetchRevertedPrNumbers({ sinceDays }) {
  try {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const stdout = execFileSync(
      "git",
      ["log", "--since=" + since, "--grep=^Revert ", "--pretty=format:%s%n%b%n---END---"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const reverted = new Set();
    for (const block of stdout.split("---END---")) {
      for (const num of extractRevertedPrNumbers(block.trim())) {
        reverted.add(num);
      }
    }
    return reverted;
  } catch {
    return null;
  }
}

function prHasNonAuthorCommit(ghBin, prNumber, author) {
  try {
    const stdout = execFileSync(
      ghBin,
      ["pr", "view", String(prNumber), "--json", "commits"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const data = JSON.parse(stdout);
    const commits = Array.isArray(data?.commits) ? data.commits : [];
    return commits.some((c) => {
      const authors = Array.isArray(c.authors) ? c.authors : [];
      return authors.some((a) => a.login && a.login !== author);
    });
  } catch {
    return false;
  }
}

export function measurePrOutcomes(opts = {}) {
  const prs = fetchAgentPrs(opts);
  if (prs === null) return null;
  return computePrOutcomes(prs, opts);
}
