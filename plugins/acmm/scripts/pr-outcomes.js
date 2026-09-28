/**
 * Agent PR outcome reader for ACMM behavioral signal (issue #647).
 *
 * ACMM previously satisfied `acmm:pr-acceptance-metric` by detecting that a
 * metrics script *exists*. This module reads the actual numbers: did agent
 * PRs land? Were they reverted? How long did they take? Did humans rewrite
 * them before merge?
 *
 * Detection of "agent PR" (#5852 audit finding 6):
 *   - PR has the `agent-authored` label, OR branch starts with one of
 *     `AGENT_BRANCH_PREFIXES`
 *   - EXCLUDING bookkeeping/automation PRs (`isBookkeepingPr`) even when they
 *     carry the label — `chore/acmm-*` daily-audit PRs are `agent-authored`
 *     in practice (measured via `gh pr list --label agent-authored`) but are
 *     the scorer auditing itself, not agent feature/fix work.
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

const AGENT_BRANCH_PREFIXES = ["worktree-agent-", "agent-", "fix/agent-", "feat/agent-"];
const AGENT_LABEL = "agent-authored";
/**
 * Branch prefixes that are the scorer/telemetry machinery auditing itself,
 * not agent feature/fix work — measured live (2026-09-28) via
 * `gh pr list --state merged --label agent-authored --limit 100 --json
 * headRefName,author`: `chore/acmm-daily-audit-*` / `chore/acmm-audit-*`
 * carry the `agent-authored` label despite being the daily audit committing
 * its own state, so the label alone over-counts (#5852 audit finding 6).
 */
const BOOKKEEPING_BRANCH_PREFIXES = [
  "metrics/",
  "chore/acmm-",
  "chore/queue-telemetry-",
  "automation/",
  "dependabot/",
];
/**
 * Known automation-bot PR-author logins, in both formats observed live:
 * `gh pr list --json author` returns Bot/App actors as `app/<slug>` on this
 * repo (e.g. `app/dependabot`, `app/github-actions`), not the `<slug>[bot]`
 * suffix form the GitHub REST API and `gh pr view --json commits` use. Both
 * are listed explicitly rather than matched by a `[bot]`/`app/` heuristic,
 * because `app/claude` is the coding agent itself and must NOT be excluded
 * here — heuristic prefix matching would catch it too.
 */
const BOOKKEEPING_AUTHOR_LOGINS = new Set([
  "github-actions",
  "github-actions[bot]",
  "app/github-actions",
  "dependabot",
  "dependabot[bot]",
  "app/dependabot",
]);
const WINDOW_DAYS = 30;
const REVERT_WINDOW_DAYS = 7;
const MIN_SAMPLE = 5;
const RECENT_CHANGES_LIMIT = 20;
const FETCH_LIMIT = 1000;

/**
 * @typedef {Object} PrRecord
 * @property {number} number
 * @property {string} title
 * @property {string} url               public GitHub PR URL
 * @property {string} headRefName       branch name
 * @property {string} state             "OPEN" | "CLOSED" | "MERGED"
 * @property {string} createdAt         ISO timestamp
 * @property {string | null} mergedAt   ISO timestamp or null
 * @property {string[]} labels          label names
 * @property {boolean} reverted_within_7d  enriched by IO layer
 * @property {boolean} human_touched    enriched by IO layer (a human-authored, non-merge commit)
 */

/**
 * Is this PR bookkeeping/automation machinery rather than agent work —
 * a daily-audit commit, a metrics snapshot, or a dependency bump?
 *
 * @param {Pick<PrRecord, "headRefName" | "author">} pr
 */
export function isBookkeepingPr(pr) {
  const branch = pr.headRefName ?? "";
  if (BOOKKEEPING_BRANCH_PREFIXES.some((p) => branch.startsWith(p))) return true;
  const author = (pr.author ?? "").toLowerCase();
  return BOOKKEEPING_AUTHOR_LOGINS.has(author);
}

/**
 * Is this PR from an agent? `agent-authored` label OR a known agent branch
 * prefix, excluding bookkeeping/automation PRs even when mislabeled (#5852).
 *
 * @param {Pick<PrRecord, "headRefName" | "labels" | "author">} pr
 */
export function isAgentPr(pr) {
  if (isBookkeepingPr(pr)) return false;
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
    // Oldest createdAt actually returned by the fetch, over the FULL `prs`
    // list (not just `inWindow`) — makes truncation visible when `--limit`
    // caps the fetch before it reaches the requested window (#5852 AC7).
    oldest_record_at: oldestTimestamp(prs),
  };
}

/** @param {Array<{createdAt: string}>} records */
function oldestTimestamp(records) {
  let oldest = null;
  for (const r of records) {
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t)) continue;
    if (oldest === null || t < oldest) oldest = t;
  }
  return oldest === null ? null : new Date(oldest).toISOString();
}

/**
 * Pick the most recently merged agent PRs for public display, newest first.
 *
 * Projects each PR down to fields that are already public on GitHub
 * (`number`, `title`, `url`, `mergedAt`) — nothing derived from the enrichment
 * passes (revert/human-touch flags, author) leaves this function.
 *
 * `recentLimit` rather than `limit` because `measurePrOutcomes` passes one
 * options object to both this and `fetchAgentPrs`, whose `limit` is the
 * `gh pr list` page size.
 *
 * @param {PrRecord[]} prs
 * @param {{ now?: Date, windowDays?: number, recentLimit?: number }} [opts]
 */
export function selectRecentChanges(prs, opts = {}) {
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - (opts.windowDays ?? WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const limit = opts.recentLimit ?? RECENT_CHANGES_LIMIT;

  return prs
    .filter((pr) => {
      if (pr.state !== "MERGED" || !pr.mergedAt || !isAgentPr(pr)) return false;
      const created = Date.parse(pr.createdAt);
      return Number.isFinite(created) && created >= cutoff;
    })
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
    .slice(0, limit)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url ?? "",
      mergedAt: pr.mergedAt,
    }));
}

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Resolve the PR reverted by an `auto-rollback agent commit <sha>` message —
 * that shape carries no PR number of its own, only the short SHA of the
 * commit it undid. `git log -1 --format=%s <sha>` re-reads that commit's own
 * subject and takes ITS trailing `(#N)` (added by squash-merge) as the
 * reverted PR number. Returns `[]` on any git failure (unknown SHA, shallow
 * clone, etc.) rather than throwing — a resolution miss should read as "no
 * revert detected", never abort the caller.
 *
 * @param {string} sha
 * @param {{ execFn?: typeof execFileSync }} [opts]
 * @returns {number[]}
 */
function resolveAutoRollbackTarget(sha, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  try {
    const subject = execFn("git", ["log", "-1", "--format=%s", sha], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const m = subject.match(/\(#(\d+)\)\s*$/);
    return m ? [Number(m[1])] : [];
  } catch {
    return [];
  }
}

/**
 * Extract the PR number(s) actually reverted by a commit message.
 *
 * Three shapes (#5852 audit finding 2 — the original only handled the
 * first):
 *   1. Legacy `git revert`: `Revert "<title> (#N)"` — every `#N` in the full
 *      message (title + body) is reported, matching pre-existing behavior.
 *   2. This repo's `revert: #<N> <description> (#<revertPR>)` — only the
 *      number immediately after `revert:` is the reverted PR; the trailing
 *      `(#<revertPR>)` is the revert commit's OWN PR (added by squash-merge)
 *      and must be excluded, e.g. `revert: #4924 … (#5165)` -> `[4924]`, not
 *      `[4924, 5165]`.
 *   3. `revert: auto-rollback agent commit <sha> (#<revertPR>)` — no PR
 *      number in the message; resolved via {@link resolveAutoRollbackTarget}.
 *
 * @param {string} message
 * @param {{ execFn?: typeof execFileSync }} [opts]
 * @returns {number[]}
 */
export function extractRevertedPrNumbers(message, opts = {}) {
  if (!message) return [];
  const firstLine = message.split("\n")[0] ?? "";

  const autoRollback = firstLine.match(
    /^revert:\s*auto-rollback agent commit\s+([0-9a-f]{6,40})\b/i
  );
  if (autoRollback) return resolveAutoRollbackTarget(autoRollback[1], opts);

  const colonRevert = firstLine.match(/^revert:\s*#(\d+)\b/i);
  if (colonRevert) return [Number(colonRevert[1])];

  if (!message.startsWith("Revert ")) return [];
  const numbers = [];
  const re = /#(\d+)/g;
  let m;
  while ((m = re.exec(message)) !== null) {
    numbers.push(Number(m[1]));
  }
  return numbers;
}

/**
 * Build the `gh pr list` args for a date-bounded fetch. Extracted so tests
 * can assert the date bound without shelling out (#5852 AC7).
 *
 * @param {{ limit?: number, windowDays?: number, now?: Date }} [opts]
 */
export function buildPrListArgs(opts = {}) {
  const limit = opts.limit ?? FETCH_LIMIT;
  const windowDays = opts.windowDays ?? WINDOW_DAYS;
  const revertLookbackDays = windowDays + REVERT_WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - revertLookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return [
    "pr",
    "list",
    "--state",
    "all",
    "--search",
    `created:>=${since}`,
    "--limit",
    String(limit),
    "--json",
    "number,title,url,headRefName,state,createdAt,mergedAt,labels,author",
  ];
}

/**
 * Fetch agent PRs and enrich with revert/human-touch flags.
 * Returns null on any tool failure so callers can detect "no signal".
 */
export function fetchAgentPrs(opts = {}) {
  const ghBin = opts.ghBin ?? "gh";
  const windowDays = opts.windowDays ?? WINDOW_DAYS;
  const revertLookbackDays = windowDays + REVERT_WINDOW_DAYS;

  let allPrs;
  try {
    const stdout = execFileSync(ghBin, buildPrListArgs(opts), {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    allPrs = JSON.parse(stdout);
  } catch {
    return null;
  }

  if (!Array.isArray(allPrs)) return null;

  const normalized = allPrs.map((pr) => ({
    number: Number(pr.number),
    title: String(pr.title ?? ""),
    url: String(pr.url ?? ""),
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
    // Enrich only agent PRs, not every merged PR (#5852 finding 6) — this is
    // one `gh pr view` call per PR, so widening it to every merged PR is a
    // real runtime cost (AC12) for data the caller filters out anyway.
    if (pr.state === "MERGED" && isAgentPr(pr)) {
      pr.human_touched = prHasHumanTouchedCommit(ghBin, pr.number);
    }
  }

  return normalized;
}

/**
 * `git log --grep` must match both this repo's revert spellings: the classic
 * capitalized `Revert "…"` and this repo's own lowercase `revert:` (#5852
 * AC4) — a single case-insensitive `^revert` anchor catches both.
 */
function fetchRevertedPrNumbers({ sinceDays }) {
  try {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const stdout = execFileSync(
      "git",
      [
        "log",
        "--since=" + since,
        "--regexp-ignore-case",
        "--grep=^revert",
        "--pretty=format:%s%n%b%n---END---",
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
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

/**
 * Logins that are never a human stepping in.
 *
 * `claude` is the one that mattered: `Co-Authored-By: Claude
 * <noreply@anthropic.com>` resolves to that GitHub login, so *every* commit
 * carrying the repo's attribution trailer looked like a non-author commit.
 * The trailer is evidence the work was agent-authored; without this set the
 * gate read it as evidence a human intervened, which is the opposite.
 *
 * Measured before the fix, over the last 40 merged agent PRs in the 30-day
 * window: 39 of 40 "human-touched", 97.5% — against a gate that requires
 * below 50%. PR #5615 is the clean case: one commit, sole author `claude`,
 * no human involvement of any kind, counted as human-touched.
 */
const NON_HUMAN_AUTHOR_LOGINS = new Set(["claude", "dependabot", "github-actions", "copilot"]);

/**
 * @param {string} login
 * @returns {boolean} true when the login is a bot or agent identity
 */
export function isNonHumanAuthor(login) {
  if (!login) return true;
  const normalized = login.toLowerCase();
  // Any future bot arrives with the `[bot]` suffix, so match it structurally
  // rather than waiting for this list to be updated after the next surprise.
  if (normalized.endsWith("[bot]")) return true;
  return NON_HUMAN_AUTHOR_LOGINS.has(normalized.replace(/\[bot\]$/, ""));
}

/** A merge commit records the merge machinery ran, not that a human wrote code. */
const MERGE_COMMIT_RE = /^Merge (branch|remote-tracking branch|pull request)/;

/**
 * @param {string} [messageHeadline]
 * @returns {boolean}
 */
export function isMergeCommit(messageHeadline) {
  return typeof messageHeadline === "string" && MERGE_COMMIT_RE.test(messageHeadline);
}

/**
 * Did a real human write at least one non-merge commit on this PR?
 *
 * A commit counts as human-touched iff its `authors` contains >=1 human
 * login AND zero agent/bot identities (#5852 AC6). This checks the commit's
 * OWN author set, never who opened the PR: the repo's attribution trailer
 * (`Co-Authored-By: Claude <noreply@anthropic.com>`) resolves to the GitHub
 * login `claude` on every agent commit, so a commit's author set is what
 * actually distinguishes agent work from hand-written work. The prior
 * `a.login !== prAuthor` rule made Matt invisible whenever he was also the
 * PR's opener — the normal case for every worktree-agent PR he runs under
 * his own account, since he is the author of essentially every agent PR here
 * (measured: `{mattbutlerengineering, app/dependabot, app/claude}` are the
 * only three PR-author logins in the `agent-authored`-labelled population).
 *
 * @param {Array<{authors?: Array<{login?: string}>, messageHeadline?: string}>} commits
 * @returns {boolean}
 */
export function commitsShowHumanTouch(commits) {
  if (!Array.isArray(commits)) return false;
  return commits.some((c) => {
    if (isMergeCommit(c?.messageHeadline)) return false;
    const logins = (Array.isArray(c?.authors) ? c.authors : [])
      .map((a) => a?.login)
      .filter(Boolean);
    if (logins.length === 0) return false;
    const hasHuman = logins.some((login) => !isNonHumanAuthor(login));
    const hasNonHuman = logins.some((login) => isNonHumanAuthor(login));
    return hasHuman && !hasNonHuman;
  });
}

function prHasHumanTouchedCommit(ghBin, prNumber) {
  try {
    const stdout = execFileSync(ghBin, ["pr", "view", String(prNumber), "--json", "commits"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const data = JSON.parse(stdout);
    return commitsShowHumanTouch(data?.commits);
  } catch {
    return false;
  }
}

export function measurePrOutcomes(opts = {}) {
  const prs = fetchAgentPrs(opts);
  if (prs === null) return null;
  return { ...computePrOutcomes(prs, opts), recent_changes: selectRecentChanges(prs, opts) };
}
