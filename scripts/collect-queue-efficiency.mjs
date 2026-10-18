/**
 * Pure collector for queue-efficiency scorecard.
 *
 * Reconstructs a composite efficiency metric from GitHub PR history + ccusage
 * spend — no changes to the agent hot path. Works on day 1 with an instant
 * rolling-7-day-median baseline because weeks of PR history already exist.
 *
 * Composite weights: first-pass-success 0.4 / cost 0.4 / time-to-merge 0.2
 *
 * Dependency injection (readPrs / readCcusage) keeps the function unit-testable
 * without live network calls. Both default to real CLI calls.
 *
 * Output shape:
 *   { available, composite, sub_metrics, distribution, baseline, regressions[] }
 */

import { execFileSync } from "node:child_process";
import {
  createGhClient,
  describeGhError,
  GhAuthError,
  GhGraphqlUnavailableError,
  GhRateLimitError,
  MissingGithubTokenError,
} from "@mbe/gh-client";
import { isAgentPr } from "../plugins/acmm/scripts/agent-pr.js";
import { readTelemetryRows } from "./queue-telemetry-store.mjs";

/** Thresholds — imported by sensors-registry.mjs's queueEfficiency entry (co-located with its detectRegression). */
export const QUEUE_EFFICIENCY_COMPOSITE_DROP = 0.05;
export const QUEUE_EFFICIENCY_FPS_DROP = 0.1;

/**
 * Sanity floor on the current-window PR count before sensor-report.mjs's
 * day-over-day `composite_vs_previous_report` regression is allowed to fire
 * (#5746). Now that `readMergedAiPrsPaged` pages the fetch by merged date
 * instead of capping total PRs, the current window reliably holds ~90-110 AI
 * PRs (measured) — this floor exists only to guard a genuinely quiet window
 * (holiday, repo pause), not to compensate for a truncated fetch the way the
 * old value of 30 had to. Measured against 57 historical
 * `metrics/sensor-report.jsonl` reports (produced under the old, truncated
 * fetch): 56/57 already reached 15, so it isn't a meaningfully looser bar
 * than before — it just stops being the thing doing the suppressing now that
 * the fetch itself is accurate.
 */
export const QUEUE_EFFICIENCY_MIN_SAMPLE_SIZE = 15;

/**
 * Days back `readMergedAiPrsPaged`'s cheap first pass searches — one day of
 * slack past the 7-day current window `collectQueueEfficiency` computes, so
 * an exact-boundary PR is never missed to date-vs-timestamp truncation.
 *
 * Because `merged:>=` is date-granular, this search returns PRs merged up to
 * ~8.5 days ago. The reader then drops everything merged before exactly
 * READ_PRS_WINDOW_DAYS ago: without that trim, the 7-8.5-day slack spills
 * into baseline week 1 (days 7-14) as a 1-1.5-day slice that poses as the
 * whole 3-week baseline (`weeks_sampled: 1`) and fires false `composite` /
 * `first_pass_success_rate` regressions.
 *
 * Scoped to the current window only, not the full 21-day/3-week baseline
 * window `collectQueueEfficiency` also computes, so the baseline is always
 * null under this reader (as it was in 100% of historical reports under the
 * old 45-PR-total cap). Populating it would multiply the batched
 * commit calls below roughly 4x (measured: ~110 AI PRs/8 days vs. ~430/30 days).
 * Revisit if a future change wants the 3-week baseline populated.
 */
const READ_PRS_LOOKBACK_DAYS = 8;

/** The current window the reader returns — matches collectQueueEfficiency's. */
const READ_PRS_WINDOW_DAYS = 7;

/**
 * Stable reason code for an `available: false` result caused by readPrs()
 * throwing — replaces the historic catch-all (#4044) so downstream consumers
 * (`buildQueueEfficiencyProcessEntry`, the daily metrics row) can tell
 * "the sensor couldn't run, and here's why" apart from a silent boolean.
 *
 * `gh-client`'s REST fallback (#3689) engages when the `gh` binary is absent,
 * so `MissingGithubTokenError` means both "no gh binary" and "no credential".
 * It also engages when `gh` is present but GraphQL is blocked (#6039, Claude
 * Code Remote); if that fallback has no token, gh-client throws
 * `GhGraphqlUnavailableError` instead, reported as `graphql_unavailable` — a
 * permanent environmental constraint, never `credential_rejected`.
 * `GhAuthError` is the credential-present-but-rejected case (#3937: a
 * Claude Code Remote session's `GITHUB_TOKEN`/`GH_TOKEN` is scoped for
 * git-over-HTTPS only, not direct REST API calls). A network failure
 * (status 0) or an unparseable response body (a proxy intercepting the
 * request with a non-JSON block page) both surface as "can't reach the real
 * endpoint" and share `endpoint_unreachable`.
 *
 * @param {unknown} err
 * @returns {string}
 */
export function classifyUnavailableReason(err) {
  if (err instanceof GhGraphqlUnavailableError) return "graphql_unavailable";
  if (err instanceof MissingGithubTokenError) return "gh_binary_absent_no_credential";
  if (err instanceof GhRateLimitError) return "rate_limited";
  if (err instanceof GhAuthError) return "credential_rejected";
  if (err instanceof SyntaxError) return "endpoint_unreachable";
  if (err instanceof Error && /network error/i.test(err.message)) return "endpoint_unreachable";
  return "query_error";
}

/**
 * Error text for an unavailable result. `credential_rejected` is the one code
 * the repo cannot fix from code (the token in the session is the problem), so
 * it says what was rejected and what to change instead of a bare status (#6312).
 *
 * @param {string} reason
 * @param {unknown} err
 * @returns {string}
 */
function explainUnavailable(reason, err) {
  const base = describeGhError(err);
  if (reason !== "credential_rejected") return base;
  return (
    `${base}. api.github.com refused the session's GITHUB_TOKEN/GH_TOKEN ` +
    `(${err.status ?? "?"}) — it is likely scoped for git-over-HTTPS only. ` +
    `Provide a token with repo read access in GITHUB_TOKEN or GH_TOKEN for this routine; ` +
    `no code change fixes this.`
  );
}

/**
 * Median of a numeric array. Returns null for empty input.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Difficulty tier from a `size:` label (preferred) or total diff size.
 *
 * @param {{ labels?: Array<{ name: string }>, additions?: number, deletions?: number }} pr
 * @returns {string}
 */
function sizeTier(pr) {
  const sizeLabel = (pr.labels ?? []).find((l) => l.name.startsWith("size:"));
  if (sizeLabel) return sizeLabel.name;
  const diff = (pr.additions ?? 0) + (pr.deletions ?? 0);
  if (diff < 50) return "size:xs";
  if (diff < 200) return "size:s";
  if (diff < 500) return "size:m";
  if (diff < 1000) return "size:l";
  return "size:xl";
}

/**
 * Matches git's default merge-commit subject ("Merge branch 'x'", "Merge
 * remote-tracking branch 'origin/main' into y", "Merge pull request #N from
 * ..."). Used as a proxy for "more than one parent" (#5746's own framing)
 * because `gh pr list --json commits` has no `parents` sub-field to request —
 * confirmed against `gh pr list --json commits --help`'s fixed JSON-FIELDS
 * enum and against a live commit's shape (authors/committedDate/messageBody/
 * messageHeadline/oid only). Every merge commit this repo's worktree agents
 * produce comes from `git merge origin/main` to resolve conflicts, which
 * always writes one of git's default subjects, so the subject is a reliable
 * stand-in for the real parent count here.
 */
const MERGE_COMMIT_SUBJECT_RE = /^merge\b/i;

/**
 * Housekeeping automation commits (llms regen, antipattern-baseline bumps) a
 * worktree agent's branch picks up while merging/rebasing — real chores, not
 * rework. Root cause of the #5738 false regression: these inflated raw
 * commitCount past 2 and scored a clean first-pass PR as a failure (#5746).
 */
const HOUSEKEEPING_SUBJECT_RE = /regenerate .*llms|antipattern.*baseline/i;

/**
 * @param {{ messageHeadline?: string }} commit
 * @returns {boolean}
 */
function isNonReworkCommit(commit) {
  const subject = commit.messageHeadline ?? "";
  return MERGE_COMMIT_SUBJECT_RE.test(subject) || HOUSEKEEPING_SUBJECT_RE.test(subject);
}

/**
 * Commit count used for the first-pass-success check, with merge commits and
 * housekeeping-automation commits excluded (#5746) — neither is rework, but
 * both inflate the raw `commits.length` a PR's branch accumulates while
 * merging main or picking up a regen/baseline commit.
 *
 * Falls back to `pr.commitCount` when the raw `commits` array isn't present
 * (e.g. test fixtures that set `commitCount` directly).
 *
 * @param {{ commits?: Array<{ messageHeadline?: string }>, commitCount?: number }} pr
 * @returns {number}
 */
function effectiveCommitCount(pr) {
  if (!Array.isArray(pr.commits)) return pr.commitCount ?? 1;
  return pr.commits.filter((c) => !isNonReworkCommit(c)).length;
}

// ── Score functions — higher is always better (0–1) ──────────────────────

/** @param {number} rate - Already 0-1. */
function scoreFirstPass(rate) {
  return rate;
}

/**
 * @param {number|null} costPerIssue - USD per merged issue. $1 = excellent, $5 = poor.
 * @returns {number|null} null when the cost is unknown — never coerced to $0 (#6941).
 */
function scoreCost(costPerIssue) {
  if (costPerIssue == null) return null;
  return Math.max(0, Math.min(1, 1 - (costPerIssue - 1) / 4));
}

/** @param {number} ttmHours - Time-to-merge in hours. 12h = excellent, 72h = poor. */
function scoreTtm(ttmHours) {
  return Math.max(0, Math.min(1, 1 - (ttmHours - 12) / 60));
}

/**
 * Weighted composite from the three normalised sub-scores.
 *
 * @param {number} fps - first-pass-success score
 * @param {number|null} cost - cost score; null (unknown cost) reweights the
 *   remaining terms to fps 0.4/0.6 and ttm 0.2/0.6 instead of scoring $0 (#6941).
 * @param {number} ttm - time-to-merge score
 * @returns {number}
 */
function computeComposite(fps, cost, ttm) {
  if (cost == null) return Math.round(((0.4 * fps + 0.2 * ttm) / 0.6) * 1000) / 1000;
  return Math.round((0.4 * fps + 0.4 * cost + 0.2 * ttm) * 1000) / 1000;
}

/** Verdicts that mean a reviewer actually ran and reached a decision. */
const REAL_VERDICTS = new Set(["pass", "flag"]);

/**
 * Share of the window's PRs that carry a real `pass`/`flag` review verdict.
 * A PR whose row records an `unknown_reasons.reviewer_verdict` is excluded
 * from the denominator (the verdict is unknowable, not missing); a PR with
 * no row at all stays in it.
 *
 * The denominator is `windowPrs.length` — the PRs that *should* have gone
 * through the review gate — not `windowRows.length`. A gate that stops
 * writing telemetry rows produces no rows for those PRs, and a rows-based
 * denominator made that indistinguishable from full coverage (`reviewed /
 * windowRows.length` = 1/1 = 1 even when only 1 of 3 window PRs had a row at
 * all) or, when zero rows existed for the whole window, `null` — a number
 * that never falls even though the thing it measures completely stopped
 * (#5005, the same denominator-scoping class as ciHealth's #4687). `skipped`
 * (low-risk fast path) and `error` (reviewer could not run) both count as
 * uncovered, same as before.
 *
 * @param {Array<object>} windowPrs
 * @param {Array<{ pr_number?: number, reviewer_verdict?: string }>} windowRows
 * @returns {{ coverage: number|null, n: number }}
 */
function reviewCoverage(windowPrs, windowRows) {
  const reviewed = windowRows.filter((r) => REAL_VERDICTS.has(r.reviewer_verdict)).length;
  const unknowable = windowRows.filter(
    (r) => !REAL_VERDICTS.has(r.reviewer_verdict) && r.unknown_reasons?.reviewer_verdict
  ).length;
  const denominator = windowPrs.length - unknowable;
  if (denominator <= 0) return { coverage: null, n: 0 };
  return { coverage: Math.round((reviewed / denominator) * 1000) / 1000, n: denominator };
}

/**
 * Compute sub-metrics for a set of merged AI PRs and their cost window.
 *
 * Cost preference (in order):
 *   1. Mean of the numeric `cost_usd` over the window PRs whose telemetry row
 *      has one (known rows only; `cost_coverage_n` says how many).
 *   2. ccusage daily total ÷ issues — only when no row has a cost AND ccusage
 *      returned a non-zero total.
 *   3. null (unknown) — never $0 (#6941).
 *
 * @param {Array<object>} windowPrs
 * @param {Array<{ totalCost?: number }>} ccusageDays
 * @param {Array<{ pr_number?: number, cost_usd?: number, reviewer_verdict?: string }>} [telemetryRows]
 * @returns {object}
 */
function computeWindowMetrics(windowPrs, ccusageDays, telemetryRows = []) {
  const firstPassCount = windowPrs.filter((pr) => effectiveCommitCount(pr) <= 2).length;
  const firstPassRate = Math.round((firstPassCount / windowPrs.length) * 1000) / 1000;

  const commitCounts = windowPrs.map((pr) => pr.commitCount ?? 1);
  const ttmHoursList = windowPrs
    .map((pr) => {
      if (!pr.createdAt || !pr.mergedAt) return null;
      return (new Date(pr.mergedAt) - new Date(pr.createdAt)) / (1000 * 60 * 60);
    })
    .filter((h) => h !== null);

  const medianTtmHours = median(ttmHoursList) ?? 24;
  const medianReworkCycles = median(commitCounts.map((c) => Math.max(0, c - 1))) ?? 0;

  // Prefer precise per-issue telemetry cost when every window PR is covered.
  const prNumbers = new Set(windowPrs.map((pr) => pr.number));
  const windowRows = (telemetryRows ?? []).filter((r) => prNumbers.has(r.pr_number));
  const matchedCosts = windowRows
    .filter((r) => typeof r.cost_usd === "number")
    .map((r) => r.cost_usd);

  const ccusageTotal = (ccusageDays ?? []).reduce((sum, d) => sum + (d.totalCost ?? 0), 0);
  let costPerIssue = null;
  if (matchedCosts.length > 0) {
    costPerIssue = matchedCosts.reduce((sum, c) => sum + c, 0) / matchedCosts.length;
  } else if (ccusageTotal > 0) {
    costPerIssue = ccusageTotal / windowPrs.length;
  }
  const review = reviewCoverage(windowPrs, windowRows);

  return {
    issues_merged: windowPrs.length,
    first_pass_success_rate: firstPassRate,
    median_time_to_merge_hours: Math.round(medianTtmHours * 10) / 10,
    median_rework_cycles: Math.round(medianReworkCycles * 10) / 10,
    cost_per_issue_usd: costPerIssue == null ? null : Math.round(costPerIssue * 1000) / 1000,
    cost_coverage_n: matchedCosts.length,
    review_coverage: review.coverage,
    review_coverage_n: review.n,
  };
}

/**
 * `YYYY-MM-DD` string N days before `now`, for GitHub search's `merged:>=`
 * qualifier (date granularity only — no time-of-day component).
 *
 * @param {Date} now
 * @param {number} days
 * @returns {string}
 */
function isoDateDaysAgo(now, days) {
  return new Date(+now - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** PRs per GraphQL request when batching commit lookups (keeps the node budget small). */
const COMMIT_BATCH_SIZE = 25;

/** Per-call timeout for the batched `gh api graphql` request — one call covers ~25 PRs. */
const COMMIT_BATCH_TIMEOUT_MS = 120_000;

/** Default `gh` runner for the batched reader; injectable for tests. */
function defaultGhExec(args) {
  return execFileSync("gh", args, { encoding: "utf-8", timeout: COMMIT_BATCH_TIMEOUT_MS });
}

/**
 * Resolves `owner/name` for the batched GraphQL query: GITHUB_REPOSITORY in
 * Actions, else `gh repo view`. Validated before use.
 *
 * @returns {{ owner: string, name: string }}
 */
function resolveRepo(exec, env) {
  const slug = (
    env.GITHUB_REPOSITORY ??
    exec(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])
  ).trim();
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(slug);
  if (!match) throw new Error(`unrecognised repository slug: ${slug}`);
  return { owner: match[1], name: match[2] };
}

const COMMITS_SELECTION = "pageInfo { hasNextPage endCursor } nodes { commit { messageHeadline } }";

/** Runs one `gh api graphql` call with string variables; throws on a data-less errors payload. */
function runGraphql(exec, query, vars) {
  const varArgs = Object.entries(vars).flatMap(([k, v]) =>
    typeof v === "number" ? ["-F", `${k}=${v}`] : ["-f", `${k}=${v}`]
  );
  const parsed = JSON.parse(exec(["api", "graphql", "-f", `query=${query}`, ...varArgs]));
  if (!parsed?.data && Array.isArray(parsed?.errors)) {
    throw new Error(`GraphQL error: ${parsed.errors.map((e) => e?.message).join("; ")}`);
  }
  return parsed?.data;
}

const toHeadlines = (nodes) =>
  (nodes ?? []).map((node) => ({ messageHeadline: node?.commit?.messageHeadline }));

/** Follows `endCursor` for one PR whose first page reported hasNextPage (>100 commits). */
function fetchRemainingCommits(exec, repo, number, cursor) {
  const query =
    "query($owner: String!, $name: String!, $number: Int!, $cursor: String!) " +
    "{ repository(owner: $owner, name: $name) { pullRequest(number: $number) " +
    `{ commits(first: 100, after: $cursor) { ${COMMITS_SELECTION} } } } }`;
  const rest = [];
  let after = cursor;
  while (after) {
    const data = runGraphql(exec, query, { ...repo, number, cursor: after });
    const commits = data?.repository?.pullRequest?.commits;
    rest.push(...toHeadlines(commits?.nodes));
    after = commits?.pageInfo?.hasNextPage ? commits.pageInfo.endCursor : null;
  }
  return rest;
}

/**
 * Default batched commit reader: ONE `gh api graphql` call per
 * COMMIT_BATCH_SIZE PRs (aliased `pullRequest` lookups), instead of one
 * `gh pr view` per PR. ~110 AI PRs/week at ~4s per `pr view` was ~7 minutes of
 * serial subprocesses and timed the sensor out (#6549). A PR with more than
 * 100 commits is paged via `endCursor` rather than silently truncated.
 *
 * Shells out to `gh` directly, bypassing gh-client's transport — so any
 * failure here is caught by readMergedAiPrsPaged, which falls back to the
 * per-PR `ghClient.pr.view` path (REST fallback, typed errors).
 *
 * @param {number[]} prNumbers non-integers are dropped (ids are interpolated into the query)
 * @param {{ exec?: (args: string[]) => string, env?: Record<string, string|undefined> }} [opts]
 * @returns {Map<number, Array<{ messageHeadline?: string }>>}
 */
export function fetchCommitsBatched(prNumbers, { exec = defaultGhExec, env = process.env } = {}) {
  const repo = resolveRepo(exec, env);
  const numbers = prNumbers.filter(Number.isInteger);
  const result = new Map();
  for (let i = 0; i < numbers.length; i += COMMIT_BATCH_SIZE) {
    const chunk = numbers.slice(i, i + COMMIT_BATCH_SIZE);
    const fields = chunk
      .map(
        (n) => `p${n}: pullRequest(number: ${n}) { commits(first: 100) { ${COMMITS_SELECTION} } }`
      )
      .join(" ");
    const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`;
    const repository = runGraphql(exec, query, repo)?.repository ?? {};
    for (const n of chunk) {
      const commits = repository[`p${n}`]?.commits;
      const first = toHeadlines(commits?.nodes);
      const rest = commits?.pageInfo?.hasNextPage
        ? fetchRemainingCommits(exec, repo, n, commits.pageInfo.endCursor)
        : [];
      result.set(n, [...first, ...rest]);
    }
  }
  return result;
}

/**
 * Per-PR fallback: one `pr view` through gh-client's transport, which keeps
 * the REST fallback when `gh` is absent (#3689), GraphQL-blocked retry
 * (#6039), and typed error classification.
 *
 * @param {import("@mbe/gh-client").GhClient} ghClient
 * @param {number} prNumber
 * @returns {Array<{ messageHeadline?: string }>}
 */
function fetchPrCommits(ghClient, prNumber) {
  const detail = ghClient.pr.view(prNumber, ["--json", "commits"]);
  return Array.isArray(detail?.commits) ? detail.commits : [];
}

/**
 * Batched fetch, else per-PR via gh-client. The batch error is not rethrown:
 * the fallback either succeeds or throws gh-client's own typed error, which
 * is what collectQueueEfficiency classifies.
 *
 * @returns {(prNumber: number) => Array<{ messageHeadline?: string }>}
 */
function commitReader(ghClient, prNumbers, fetchCommits) {
  if (prNumbers.length === 0) return () => [];
  let batched;
  try {
    batched = fetchCommits(prNumbers);
  } catch (err) {
    process.stderr.write(
      `queue-efficiency: batched commit fetch failed (${err?.message ?? err}); falling back to per-PR pr view\n`
    );
    return (n) => fetchPrCommits(ghClient, n);
  }
  return (n) => batched.get(n) ?? [];
}

/**
 * Fetches merged PRs paged by merged date instead of a single commits-
 * inclusive `pr list` call (#5746). Lets errors propagate — the caller
 * decides whether to catch (see defaultReadPrs) or let collectQueueEfficiency
 * classify the failure via describeGhError (see readQueueEfficiencyPrs in
 * sensors-registry.mjs, #3946).
 *
 * The old approach requested `commits` for every PR in one `pr list --limit
 * 45` call, capping the *total* PR count to stay under GitHub's ~500k
 * GraphQL node budget (the commits sub-field multiplies PRs × ~11k
 * potential nodes/PR) — but this repo merges ~20-30 PRs/day, so 45 PRs
 * covered only ~2.5 days, not the intended 7 (measured against #5738's
 * false regression).
 *
 * Two passes instead:
 *   1. One cheap `pr list` call over the lookback window, WITHOUT `commits`
 *      — no per-PR node multiplication, so ~200 PRs in one call is safe
 *      (measured: 216 merged PRs in the last 8 days).
 *   2. `commits` fetched for AI PRs only (~110/8 days) in batched GraphQL
 *      calls of COMMIT_BATCH_SIZE PRs each — NOT one `pr view` per PR, which
 *      took ~4s apiece and timed the sensor out (#6549).
 *
 * @param {import("@mbe/gh-client").GhClient} ghClient
 * @param {Date} now
 * @param {(prNumbers: number[]) => Map<number, Array<{ messageHeadline?: string }>>} [fetchCommits]
 *   injectable batched commit reader (defaults to GraphQL, O(PRs/25) calls)
 * @returns {Array<object>}
 */
export function readMergedAiPrsPaged(ghClient, now, fetchCommits = fetchCommitsBatched) {
  const cutoff = isoDateDaysAgo(now, READ_PRS_LOOKBACK_DAYS);
  const windowStart = +now - READ_PRS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  // No `--state merged`: `merged:>=` already implies it, and under
  // gh-client's REST fallback (no `gh` binary) `--state merged` becomes a
  // `state:merged` search qualifier GitHub doesn't recognise — measured to
  // return total_count 0.
  const prs = ghClient.pr.list([
    "--search",
    `merged:>=${cutoff}`,
    "--limit",
    "500",
    "--json",
    "number,state,headRefName,author,createdAt,mergedAt,closedAt,labels,additions,deletions",
  ]);
  const inWindow = prs.filter((pr) => Date.parse(pr.mergedAt) >= windowStart);
  const agentNumbers = inWindow.filter(isAgentPr).map((pr) => pr.number);
  const readCommits = commitReader(ghClient, agentNumbers, fetchCommits);
  return inWindow.map((pr) => {
    if (!isAgentPr(pr)) return { ...pr, commitCount: 1 };
    const commits = readCommits(pr.number);
    return { ...pr, commits, commitCount: commits.length };
  });
}

/**
 * Default PR reader — wraps readMergedAiPrsPaged, catching any error to
 * `null` (distinct from readQueueEfficiencyPrs in sensors-registry.mjs,
 * which lets the same error propagate for collectQueueEfficiency's own
 * classification — this default is only used when collectQueueEfficiency
 * is called with no explicit readPrs, i.e. not by the live sensor).
 *
 * @param {import("@mbe/gh-client").GhClient} [ghClient]
 * @param {Date} [now]
 * @returns {Array<object>|null}
 */
export function defaultReadPrs(
  ghClient = createGhClient(),
  now = new Date(),
  fetchCommits = fetchCommitsBatched
) {
  try {
    return readMergedAiPrsPaged(ghClient, now, fetchCommits);
  } catch {
    return null;
  }
}

/**
 * Default ccusage reader — same shape as collect-ccusage.mjs.
 *
 * @returns {{ daily: Array<{ period: string, totalCost: number }> }|null}
 */
function defaultReadCcusage() {
  try {
    const raw = execFileSync("npx", ["-y", "ccusage@latest", "daily", "--json", "--no-cost"], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Default telemetry reader — reads the queue-telemetry metric via the store.
 *
 * @returns {Array<object>|null}
 */
function defaultReadTelemetry() {
  try {
    return readTelemetryRows();
  } catch {
    return null;
  }
}

/**
 * Collect the queue-efficiency scorecard.
 *
 * @param {() => Array<object>|null} [readPrs] - Injected PR reader.
 * @param {() => { daily: Array<object> }|null} [readCcusage] - Injected ccusage reader.
 * @param {Date} [now] - Reference time (injectable for tests).
 * @param {() => Array<object>|null} [readTelemetry] - Injected telemetry reader.
 *   When provided rows cover all current-window PRs with `cost_usd`, the
 *   per-issue precise cost is preferred over the ccusage daily estimate.
 * @returns {{
 *   available: boolean,
 *   reason?: string,
 *   error?: string,
 *   composite?: number,
 *   sub_metrics?: object,
 *   distribution?: object,
 *   baseline?: object|null,
 *   regressions?: Array<object>,
 * }}
 *   `reason` is a stable code (see {@link classifyUnavailableReason}) present
 *   whenever `available` is false — never a bare `{ available: false }` (#4044).
 */
export function collectQueueEfficiency(
  readPrs = defaultReadPrs,
  readCcusage = defaultReadCcusage,
  now = new Date(),
  readTelemetry = defaultReadTelemetry
) {
  let prs;
  try {
    prs = readPrs();
  } catch (err) {
    // Distinguishable from "no PRs" (#3937/#3946) — a thrown error (e.g. auth
    // failure) is a query failure, not an empty-but-valid result.
    const reason = classifyUnavailableReason(err);
    return { available: false, reason, error: explainUnavailable(reason, err) };
  }
  if (!Array.isArray(prs) || prs.length === 0) {
    return { available: false, reason: "no_data_in_range" };
  }

  let ccusageData;
  try {
    ccusageData = readCcusage();
  } catch {
    ccusageData = null;
  }

  let telemetryRows;
  try {
    telemetryRows = readTelemetry() ?? [];
  } catch {
    telemetryRows = [];
  }

  const sevenDaysAgo = new Date(+now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(+now - 30 * 24 * 60 * 60 * 1000);
  const dailyEntries = Array.isArray(ccusageData?.daily) ? ccusageData.daily : [];

  // Only merged AI PRs within the last 30 days form our analysis pool.
  const mergedAiPrs = prs.filter((pr) => {
    if (!isAgentPr(pr)) return false;
    if (!pr.mergedAt) return false;
    const d = new Date(pr.mergedAt);
    return !isNaN(d) && d >= thirtyDaysAgo;
  });

  if (mergedAiPrs.length === 0) return { available: false, reason: "no_data_in_range" };

  const currentPrs = mergedAiPrs.filter((pr) => new Date(pr.mergedAt) >= sevenDaysAgo);
  if (currentPrs.length === 0) return { available: false, reason: "no_data_in_range" };

  const currentCcusageDays = dailyEntries.filter((d) => new Date(d.period) >= sevenDaysAgo);
  // Pass telemetry rows for precise per-issue cost preference (falls back to ccusage).
  const currentMetrics = computeWindowMetrics(currentPrs, currentCcusageDays, telemetryRows);

  // Rolling baseline from the 3 prior weekly windows (days 8–28).
  const weekMetrics = [];
  for (let w = 1; w <= 3; w++) {
    const weekStart = new Date(+now - (w + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(+now - w * 7 * 24 * 60 * 60 * 1000);
    const weekPrs = mergedAiPrs.filter((pr) => {
      const d = new Date(pr.mergedAt);
      return d >= weekStart && d < weekEnd;
    });
    if (weekPrs.length === 0) continue;
    const weekCcusageDays = dailyEntries.filter((d) => {
      const day = new Date(d.period);
      return day >= weekStart && day < weekEnd;
    });
    weekMetrics.push(computeWindowMetrics(weekPrs, weekCcusageDays, telemetryRows));
  }

  const fpScore = scoreFirstPass(currentMetrics.first_pass_success_rate);
  const costScore = scoreCost(currentMetrics.cost_per_issue_usd);
  const ttmScore = scoreTtm(currentMetrics.median_time_to_merge_hours);
  const compositeScore = computeComposite(fpScore, costScore, ttmScore);

  const baseline =
    weekMetrics.length === 0
      ? null
      : {
          composite_median: median(
            weekMetrics.map((m) =>
              computeComposite(
                scoreFirstPass(m.first_pass_success_rate),
                scoreCost(m.cost_per_issue_usd),
                scoreTtm(m.median_time_to_merge_hours)
              )
            )
          ),
          weeks_sampled: weekMetrics.length,
          fps_median: median(weekMetrics.map((m) => m.first_pass_success_rate)),
          ttm_median: median(weekMetrics.map((m) => m.median_time_to_merge_hours)),
          cost_per_issue_median: median(
            weekMetrics.map((m) => m.cost_per_issue_usd).filter((c) => c != null)
          ),
        };

  const regressions = [];
  if (baseline?.composite_median != null) {
    const delta = compositeScore - baseline.composite_median;
    if (delta < -QUEUE_EFFICIENCY_COMPOSITE_DROP) {
      regressions.push({
        sensor: "queueEfficiency",
        metric: "composite",
        current: compositeScore,
        baseline: baseline.composite_median,
        delta: Math.round(delta * 1000) / 1000,
        severity: delta < -0.15 ? "high" : "medium",
      });
    }
  }
  if (baseline?.fps_median != null) {
    const fpsDelta = currentMetrics.first_pass_success_rate - baseline.fps_median;
    if (fpsDelta < -QUEUE_EFFICIENCY_FPS_DROP) {
      regressions.push({
        sensor: "queueEfficiency",
        metric: "first_pass_success_rate",
        current: currentMetrics.first_pass_success_rate,
        baseline: baseline.fps_median,
        delta: Math.round(fpsDelta * 1000) / 1000,
        severity: fpsDelta < -0.2 ? "high" : "medium",
      });
    }
  }

  // Distribution by difficulty tier — Goodhart guard.
  const distAccum = {};
  for (const pr of currentPrs) {
    const tier = sizeTier(pr);
    const ttmH =
      pr.createdAt && pr.mergedAt
        ? (new Date(pr.mergedAt) - new Date(pr.createdAt)) / (1000 * 60 * 60)
        : 0;
    const prev = distAccum[tier] ?? { count: 0, total_commits: 0, total_ttm_hours: 0 };
    distAccum[tier] = {
      count: prev.count + 1,
      total_commits: prev.total_commits + (pr.commitCount ?? 1),
      total_ttm_hours: prev.total_ttm_hours + ttmH,
    };
  }

  const distribution = Object.fromEntries(
    Object.entries(distAccum).map(([tier, acc]) => [
      tier,
      {
        count: acc.count,
        avg_commits: Math.round((acc.total_commits / acc.count) * 10) / 10,
        avg_ttm_hours: Math.round((acc.total_ttm_hours / acc.count) * 10) / 10,
      },
    ])
  );

  return {
    available: true,
    composite: compositeScore,
    sub_metrics: currentMetrics,
    distribution,
    baseline,
    regressions,
  };
}
