#!/usr/bin/env node
/**
 * routine-liveness.mjs — daily check that every claude.ai RemoteTrigger
 * routine actually produced its expected artifact this period (#5552).
 *
 * `mbe-weekly-improve` (Fri 7:00am PT) produced no PR on 2026-09-18. It was
 * only detectable because #5344/#5373 had just given it a required PR title
 * convention three days earlier — before that, its output was
 * indistinguishable from ordinary implement-queue traffic, and it read as
 * "unverifiable" (not "dark") for two consecutive weekly retros. This script
 * turns that mechanical, human-run retro check ("does an artifact matching
 * this routine's signature exist within its expected period?") into a daily
 * job, shortening detection from up to 7 days to one period.
 *
 * `classifyRoutineLiveness()` is a pure function of a routine's declared
 * signature + period + observed artifacts; the network lives entirely behind
 * injected callbacks in `runRoutineLivenessCheck()`, mirroring
 * `scheduled-workflow-health.mjs`'s design so the two stay easy to read
 * side by side. The list/issue queries go through `@mbe/gh-client`, which
 * falls back to the GitHub REST API when `gh` is unavailable (Claude Code
 * Remote sessions; see .claude/rules/gotchas.md § Claude Code Remote). The
 * one exception is `observe: "latest-matching-commit"`'s commit lookup, which
 * calls `gh api` (the Actions runner has it); without `gh` that routine alone
 * reads `unobserved`, never aborting the run.
 *
 * Usage:
 *   node scripts/routine-liveness.mjs
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createGhClient, COORDINATION_LABELS } from "@mbe/gh-client";
import { ROUTINE_MANIFEST } from "./routine-manifest.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure: true when `artifact` matches `signature`.
 *
 * @param {{type?: "pr"|"issue", title?: string, labels?: string[]}} artifact
 * @param {import("./routine-manifest.mjs").RoutineSignature} signature
 * @returns {boolean}
 */
export function matchesSignature(artifact, signature) {
  if (!artifact || !signature) return false;

  if (signature.type === "pr-title") {
    return artifact.type === "pr" && new RegExp(signature.pattern).test(artifact.title ?? "");
  }
  if (signature.type === "issue-label") {
    return artifact.type === "issue" && (artifact.labels ?? []).includes(signature.label);
  }
  return false;
}

/**
 * Pure, network-free decision: classifies a routine's liveness from its
 * declared signature, expected period, and observed artifacts.
 *
 * - No `signature` declared → `unverifiable`. Fails closed rather than
 *   silently passing — this is exactly the state `mbe-weekly-improve` sat in
 *   for two consecutive retros before it had a detectable signature.
 * - At least one matching artifact observed within `periodDays` → `alive`.
 * - Most recent matching artifact is older than `periodDays` but within
 *   `2 * periodDays` → `late` (it ran, just not on schedule).
 * - No matching artifact within `2 * periodDays` (or none at all) → `dark`.
 * - Exception: no matching artifact at all while the routine's `activatedAt`
 *   is younger than `2 * periodDays` → `pending` (files nothing). A routine
 *   created today has had no chance to fire yet; without this the checker
 *   files a false `dark` on the morning between merge and first fire. An
 *   unparseable `activatedAt` grants no grace, and without one the result is
 *   exactly what it always was.
 *
 * @param {{
 *   signature?: import("./routine-manifest.mjs").RoutineSignature,
 *   periodDays: number,
 *   observedArtifacts?: Array<{type?: string, title?: string, labels?: string[], observedAt?: string}>,
 *   now: string|number|Date,
 *   activatedAt?: string,
 * }} args
 * @returns {{status: "alive"|"late"|"dark"|"unverifiable"|"pending", matched: object|null, reason?: string}}
 */
export function classifyRoutineLiveness({
  signature,
  periodDays,
  observedArtifacts = [],
  now,
  activatedAt,
}) {
  if (!signature) {
    return { status: "unverifiable", matched: null };
  }

  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error(`classifyRoutineLiveness: invalid "now": ${now}`);
  }

  const period = Number.isFinite(periodDays) && periodDays > 0 ? periodDays : 1;
  const periodMs = period * DAY_MS;

  const matching = (observedArtifacts ?? [])
    .filter((artifact) => matchesSignature(artifact, signature))
    .map((artifact) => ({ artifact, ageMs: nowMs - new Date(artifact.observedAt ?? "").getTime() }))
    .filter((entry) => Number.isFinite(entry.ageMs) && entry.ageMs >= 0)
    .sort((a, b) => a.ageMs - b.ageMs);

  const mostRecent = matching[0];
  if (!mostRecent) {
    const activatedMs = activatedAt === undefined ? NaN : new Date(activatedAt).getTime();
    if (Number.isFinite(activatedMs) && nowMs - activatedMs < periodMs * 2) {
      return {
        status: "pending",
        matched: null,
        reason: `activated ${activatedAt}, younger than 2 x ${period}-day period — no run expected yet`,
      };
    }
    return { status: "dark", matched: null };
  }
  if (mostRecent.ageMs <= periodMs) {
    return { status: "alive", matched: mostRecent.artifact };
  }
  if (mostRecent.ageMs <= periodMs * 2) {
    return { status: "late", matched: mostRecent.artifact };
  }
  return { status: "dark", matched: mostRecent.artifact };
}

/** Pure: builds the deterministic finding title so re-runs dedupe by title match. */
export function buildRoutineFindingTitle(name, status) {
  if (status === "dark") return `ci-fix: routine ${name} is dark — no expected artifact observed`;
  if (status === "unverifiable")
    return `ci-fix: routine ${name} has no declared liveness signature (unverifiable)`;
  throw new Error(`buildRoutineFindingTitle: unexpected status "${status}"`);
}

const ROUTINE_FINDING_TITLE_PATTERN =
  /^ci-fix: routine (\S+) (?:is dark|has no declared liveness signature)/;

/** Pure: extracts the routine name a finding issue was filed for, from its title. */
export function extractRoutineNameFromIssueTitle(issue) {
  const match = ROUTINE_FINDING_TITLE_PATTERN.exec(issue?.title ?? "");
  return match ? match[1] : null;
}

/**
 * Pure: extracts which status ("dark" or "unverifiable") a finding issue was
 * originally filed for, from its title. Used by `decideIssueTransition` to
 * tell a genuine dark→alive recovery (auto-closeable) from an unverifiable
 * finding (never auto-closed by a signature flip alone — see #5817).
 *
 * @param {{title?: string}} issue
 * @returns {"dark" | "unverifiable" | null}
 */
export function extractRoutineFindingStatusFromTitle(issue) {
  const title = issue?.title ?? "";
  if (!ROUTINE_FINDING_TITLE_PATTERN.test(title)) return null;
  return title.includes("has no declared liveness signature") ? "unverifiable" : "dark";
}

/**
 * Pure: finds a prior finding issue (candidate object) for `routineName`
 * among candidate issues (any state).
 *
 * @param {Array<{number: number, title: string}>} candidates
 * @param {string} routineName
 * @returns {{number: number, title: string} | null}
 */
export function findPriorRoutineFindingCandidate(candidates, routineName) {
  const match = (candidates ?? []).find(
    (issue) => extractRoutineNameFromIssueTitle(issue) === routineName
  );
  return match ?? null;
}

/**
 * Pure decision: given a routine's classified liveness status and any
 * existing tracking issue found for it, decides whether to create a fresh
 * issue, skip (already tracked), close a recovered routine's issue, or do
 * nothing.
 *
 * Never reopens a closed issue — a closed finding was either resolved by a
 * human or auto-closed by this check on recovery, and either way a fresh
 * occurrence is a new incident with its own record, not a reopen of the old
 * one (#5817).
 *
 * `existingIssue.filedStatus` is which status the issue was ORIGINALLY filed
 * for. Only a genuine dark→alive recovery closes automatically: an
 * `unverifiable` finding stays open until a human gives its routine a
 * detectable signature — that's #5748's job, not this check's — so an
 * `alive` routine with an open *unverifiable* tracking issue is a no-op here.
 *
 * @param {{
 *   status: "alive"|"late"|"dark"|"unverifiable",
 *   existingIssue: {number: number, state: "open"|"closed"|"missing", filedStatus?: "dark"|"unverifiable"|null} | null,
 * }} args
 * @returns {{action: "create"} | {action: "skip", issueNumber: number} | {action: "close", issueNumber: number} | {action: "no-op"}}
 */
export function decideIssueTransition({ status, existingIssue }) {
  if (status === "dark" || status === "unverifiable") {
    if (!existingIssue || existingIssue.state === "missing") {
      return { action: "create" };
    }
    if (existingIssue.state === "open") {
      return { action: "skip", issueNumber: existingIssue.number };
    }
    return { action: "create" };
  }

  if (
    status === "alive" &&
    existingIssue?.state === "open" &&
    existingIssue.filedStatus === "dark"
  ) {
    return { action: "close", issueNumber: existingIssue.number };
  }

  return { action: "no-op" };
}

/** Pure: builds the issue body describing why a routine was flagged. */
export function buildRoutineFindingBody({ name, triggerId, status, periodDays, reason, matched }) {
  const triggerLine = triggerId ? `**Trigger:** \`${triggerId}\`\n` : "";
  const matchedLine = matched
    ? `\n**Most recent matching artifact:** ${matched.title ?? JSON.stringify(matched.labels ?? [])} (${matched.observedAt})\n`
    : "";
  const reasonLine = reason ? `\n${reason}\n` : "";

  const summary =
    status === "dark"
      ? `Routine \`${name}\` produced no artifact matching its declared signature within ${periodDays * 2} days (expected period: ${periodDays} day(s)).`
      : `Routine \`${name}\` has no declared liveness signature — it cannot be verified as alive or dark.`;

  return `${summary}
${triggerLine}${matchedLine}${reasonLine}
**Action Required:** investigate whether \`${name}\` actually ran this period, and — if it has no signature yet — give it a detectable PR-title or issue-label convention (see \`docs/routines/mbe-weekly-improve.md\` and #5344/#5373 for the pattern).`;
}

/**
 * Pure: builds the comment posted when auto-closing a routine's tracking
 * issue on recovery, naming the run and the artifact that proves liveness —
 * so the close is auditable, not a silent state change (#5817).
 *
 * @param {{name: string, runId?: string|number, matched: {title?: string, labels?: string[], observedAt?: string} | null}} args
 * @returns {string}
 */
export function buildRoutineRecoveryComment({ name, runId, matched }) {
  const runLine = runId
    ? `Closed automatically by run \`${runId}\`.`
    : "Closed automatically by routine-liveness.mjs.";
  const matchedLine = matched
    ? ` Observed artifact: ${matched.title ?? JSON.stringify(matched.labels ?? [])} (${matched.observedAt}).`
    : "";

  return `\`${name}\` reports \`alive\` again — this finding's condition has cleared.\n\n${runLine}${matchedLine}`;
}

/** Pure: builds the `gh issue create` args for a routine-liveness finding. */
export function buildRoutineFindingCreateArgs(title, body) {
  return [
    "--title",
    title,
    "--body",
    body,
    "--label",
    "ci-fix",
    "--label",
    COORDINATION_LABELS.READY,
  ];
}

/**
 * Orchestrates the liveness check across the manifest, with injected GitHub
 * operations (testable without the network). `outOfScope` entries are
 * skipped entirely — they're watched by a different detector
 * (scheduled-workflow-health.mjs). For every other entry: classify, look up
 * any existing tracking issue, and let `decideIssueTransition()` pick
 * create/skip/close/no-op — at most one open issue per routine, and a
 * `dark`→`alive` recovery closes it automatically (#5817).
 *
 * `searchCiFixIssues` now runs lazily and at most once per run (not once per
 * entry) — a genuinely `alive` routine needs the same candidate lookup a
 * `dark`/`unverifiable` one does, to know whether it has something to close,
 * so reusing one search keeps this from turning into N network round-trips.
 *
 * @param {{
 *   manifest: import("./routine-manifest.mjs").RoutineManifestEntry[],
 *   fetchObservedArtifacts: (entry: object) => Array<object>,
 *   now: string|number|Date,
 *   searchCiFixIssues?: () => Array<{number: number, title: string}>,
 *   getIssueState?: (issueNumber: number) => "open"|"closed"|"missing",
 *   createIssue: (title: string, body: string, labels: string[]) => number,
 *   closeIssue?: (issueNumber: number, comment: string) => void,
 *   runId?: string|number,
 *   log?: (msg: string) => void,
 * }} deps
 * @returns {Array<{routine: string, status: string, action?: string, issueNumber?: number}>}
 */
/**
 * True when every signature-bearing routine observed ZERO candidate artifacts
 * in one run.
 *
 * `classifyRoutineLiveness` returns `dark` both when it saw artifacts and none
 * matched, and when it saw nothing at all. Those are very different facts: the
 * first is evidence about the routine, the second is the absence of evidence
 * about anything. A single routine observing nothing is ordinary (its search
 * term is unique to it, and a routine that has never run has never produced a
 * match). Every signature-bearing routine observing nothing at once is not —
 * that is one shared input failing, not N independent routines dying on the
 * same day.
 *
 * Measured on the checker's first real run (2026-09-21, run 35616408240): all
 * six signature-bearing routines were filed `dark` in one pass, while
 * `mbe-morning` had in fact produced a PR matching its regex on eight
 * consecutive days — including 23 hours earlier, comfortably inside its 1-day
 * period. See #5606.
 *
 * Same reasoning as the dedupe-search fail-closed below: a missed day is
 * recoverable, but a stream of issues blaming healthy routines trains everyone
 * to ignore this producer.
 *
 * @param {Array<{hasSignature: boolean, observedCount: number}>} observations
 * @returns {boolean}
 */
export function isObservationBlackout(observations) {
  const signed = (observations ?? []).filter((o) => o.hasSignature);
  // At least TWO independent observers must agree on seeing nothing. With one,
  // "the query is broken" and "this routine has genuinely never produced a
  // matching artifact" are the same observation, and suppressing it would
  // silently swallow the finding this checker exists to make.
  return signed.length >= 2 && signed.every((o) => o.observedCount === 0);
}

export function runRoutineLivenessCheck({
  manifest,
  fetchObservedArtifacts,
  now,
  searchCiFixIssues = () => [],
  getIssueState = () => "missing",
  createIssue,
  closeIssue = () => {},
  runId,
  log = () => {},
}) {
  const inScope = manifest.filter((entry) => !entry.outOfScope);

  // Observe every routine BEFORE classifying any, so a run-wide observation
  // failure is visible as such instead of N separate "dark" verdicts.
  //
  // One routine's observation throwing must not abort the run (review N1:
  // an over-limit GraphQL query took down every routine's classification).
  // A failed observation is `unobserved` — not `dark`/`unverifiable`, whose
  // issue titles would blame the routine for the query's failure.
  const observations = inScope.map((entry) => {
    let observedArtifacts = [];
    let observeError = null;
    if (entry.signature) {
      try {
        observedArtifacts = fetchObservedArtifacts(entry);
        log(`observed ${observedArtifacts.length} candidate artifact(s) for ${entry.name}`);
      } catch (err) {
        observeError = err;
        log(`observing ${entry.name} failed — not classifying it this run: ${err?.message ?? err}`);
      }
    }
    return {
      entry,
      observedArtifacts,
      observeError,
      hasSignature: Boolean(entry.signature),
      observedCount: observedArtifacts.length,
    };
  });

  if (isObservationBlackout(observations)) {
    log(
      `every signature-bearing routine observed 0 candidate artifacts — treating this as an ` +
        `artifact-query failure, not ${observations.filter((o) => o.hasSignature).length} dark routines. ` +
        `Filing nothing this run (#5606).`
    );
    return observations.map(({ entry, observeError }) =>
      observeError
        ? { routine: entry.name, status: "unobserved", action: "observe-failed" }
        : { routine: entry.name, status: "unobserved" }
    );
  }

  // Fail CLOSED on a failed search, run at most once for the whole batch. For
  // dark/unverifiable this avoids filing a duplicate issue on every run the
  // search is down (#5553); for alive it just means a recovered routine's
  // issue stays open one more run — cosmetic, not a correctness risk, so it
  // is not worth a second failure mode. Lazy: entries with no reason to look
  // (status "late") never pay for it.
  let candidates = null;
  let searchError = null;
  let searchAttempted = false;
  const getCandidates = () => {
    if (searchAttempted) return candidates;
    searchAttempted = true;
    try {
      candidates = searchCiFixIssues();
    } catch (err) {
      searchError = err;
      candidates = null;
    }
    return candidates;
  };

  return observations.map(({ entry, observedArtifacts, observeError }) => {
    if (observeError) {
      return { routine: entry.name, status: "unobserved", action: "observe-failed" };
    }
    const result = classifyRoutineLiveness({
      signature: entry.signature,
      periodDays: entry.periodDays,
      observedArtifacts,
      now,
      activatedAt: entry.activatedAt,
    });

    if (result.status === "pending") {
      log(`${entry.name} is pending: ${result.reason}`);
    }
    // late and pending never file or close anything: late is below the issue
    // threshold, and pending (#activatedAt grace) has no artifact yet.
    if (result.status === "late" || result.status === "pending") {
      return { routine: entry.name, status: result.status };
    }

    const cands = getCandidates();
    if (cands === null) {
      if (result.status === "dark" || result.status === "unverifiable") {
        log(
          `search for a prior routine-liveness issue failed — not filing for ${entry.name} ` +
            `this run, to avoid duplicating an issue the search could not see: ${searchError?.message}`
        );
        return { routine: entry.name, status: result.status, action: "search-failed" };
      }
      return { routine: entry.name, status: result.status };
    }

    const priorMatch = findPriorRoutineFindingCandidate(cands, entry.name);
    const existingIssue = priorMatch
      ? {
          number: priorMatch.number,
          state: getIssueState(priorMatch.number),
          filedStatus: extractRoutineFindingStatusFromTitle(priorMatch),
        }
      : null;

    const decision = decideIssueTransition({ status: result.status, existingIssue });

    if (decision.action === "no-op") {
      return { routine: entry.name, status: result.status };
    }

    if (decision.action === "skip") {
      log(
        `Issue #${decision.issueNumber} already tracks ${entry.name}'s ${result.status} liveness — skipping.`
      );
      return {
        routine: entry.name,
        status: result.status,
        action: "skip",
        issueNumber: decision.issueNumber,
      };
    }

    if (decision.action === "close") {
      const comment = buildRoutineRecoveryComment({
        name: entry.name,
        runId,
        matched: result.matched,
      });
      closeIssue(decision.issueNumber, comment);
      log(`Closed issue #${decision.issueNumber} — ${entry.name} recovered to alive.`);
      return {
        routine: entry.name,
        status: result.status,
        action: "close",
        issueNumber: decision.issueNumber,
      };
    }

    // decision.action === "create"
    const title = buildRoutineFindingTitle(entry.name, result.status);
    const body = buildRoutineFindingBody({
      name: entry.name,
      triggerId: entry.triggerId,
      status: result.status,
      periodDays: entry.periodDays,
      reason: entry.unverifiableReason,
      matched: result.matched,
    });
    const labels = ["ci-fix", COORDINATION_LABELS.READY];
    const issueNumber = createIssue(title, body, labels);
    log(`Created issue #${issueNumber} for ${entry.name}'s ${result.status} liveness.`);

    return { routine: entry.name, status: result.status, action: "create", issueNumber };
  });
}

/** The one `observe` mode a `pr-title` signature may opt into. */
export const LATEST_MATCHING_COMMIT = "latest-matching-commit";

/**
 * Pure: the `observedAt` of a PR under `observe: "latest-matching-commit"` —
 * the newest `committedDate` among its commits whose `messageHeadline` matches
 * the signature pattern, else `createdAt`. A long-lived PR that a routine
 * commits to on every fire (mbe-ui-quality's ledger PR) is dated by its latest
 * fire, not its first day; `mergedAt` is never used — a merge is someone
 * else's act, not a fire. An unparseable commit date is ignored, never read
 * as fresh.
 *
 * @param {{createdAt?: string, commits?: Array<{messageHeadline?: string, committedDate?: string}>}} pr
 * @param {{pattern: string}} signature
 * @returns {string|undefined}
 */
export function latestMatchingCommitAt(pr, signature) {
  const pattern = new RegExp(signature.pattern);
  const newest = (pr.commits ?? [])
    .filter((c) => pattern.test(c?.messageHeadline ?? ""))
    .map((c) => ({ at: c.committedDate, ms: new Date(c.committedDate ?? "").getTime() }))
    .filter((c) => Number.isFinite(c.ms))
    .sort((a, b) => b.ms - a.ms)[0];
  return newest ? newest.at : pr.createdAt;
}

/** Page size for the REST commit listings below (GitHub's maximum). */
const COMMITS_PER_PAGE = 100;
/**
 * Pages read from an open PR's head branch before giving up. The branch
 * carries `main`'s merged-in history, newest first, so a live routine's
 * ledger commit is on page 1; ten pages is weeks of `main` traffic, past
 * which the routine is `dark` whatever the exact date.
 */
export const MAX_BRANCH_COMMIT_PAGES = 10;

/** Real `apiGet`: one `gh api` GET, parsed. `{owner}/{repo}` resolve from the checkout. */
function ghApiGet(path) {
  return JSON.parse(
    execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  );
}

/** Pure: a REST commit row as the `{messageHeadline, committedDate}` `latestMatchingCommitAt` reads. */
function toHeadlineCommit(row) {
  return {
    messageHeadline: String(row?.commit?.message ?? "").split("\n")[0],
    committedDate: row?.commit?.committer?.date,
  };
}

/**
 * The commits that date one title-matching PR under `observe:
 * "latest-matching-commit"`, via REST — never the GraphQL `commits` field,
 * whose `first: 100` both breaks the 500,000-node limit inside a `--limit
 * 50` list (review N1) and hides every commit past the 100th (N2).
 *
 * - Open PR: its head branch, newest first, stopping at the first page that
 *   carries a match.
 * - Closed or merged PR: its own commit list, every page (GitHub caps it at
 *   250) — its branch may already be deleted.
 *
 * @param {(path: string) => Array<object>} apiGet
 * @param {{number?: number, state?: string, headRefName?: string}} pr
 * @param {RegExp} pattern
 */
function fetchPrCommits(apiGet, pr, pattern) {
  const open = pr.state === "OPEN" && pr.headRefName;
  const base = open
    ? `repos/{owner}/{repo}/commits?sha=${pr.headRefName}&per_page=${COMMITS_PER_PAGE}`
    : `repos/{owner}/{repo}/pulls/${pr.number}/commits?per_page=${COMMITS_PER_PAGE}`;
  const commits = [];
  for (let page = 1; !open || page <= MAX_BRANCH_COMMIT_PAGES; page++) {
    const rows = apiGet(`${base}&page=${page}`);
    const mapped = (Array.isArray(rows) ? rows : []).map(toHeadlineCommit);
    commits.push(...mapped);
    if (mapped.length < COMMITS_PER_PAGE) break;
    if (open && mapped.some((c) => pattern.test(c.messageHeadline))) break;
  }
  return commits;
}

/**
 * Fetches observed artifacts for one manifest entry via a real `@mbe/gh-client`
 * instance. Search results are capped at 50 and not date-sorted server-side
 * (the REST search fallback doesn't set `sort=created`) — acceptable here
 * because `classifyRoutineLiveness()` only needs the single most-recent
 * match, not a complete history.
 *
 * `observe: "latest-matching-commit"` fetches commits (via `apiGet`, `gh
 * api` by default) only for the PRs whose title matches the signature — the
 * only ones `classifyRoutineLiveness()` reads.
 *
 * @param {ReturnType<typeof createGhClient>} ghClient
 * @param {import("./routine-manifest.mjs").RoutineManifestEntry} entry
 * @param {{apiGet?: (path: string) => Array<object>}} [deps]
 * @returns {Array<{type: string, title?: string, labels?: string[], observedAt?: string}>}
 */
export function fetchObservedArtifactsViaGhClient(ghClient, entry, { apiGet = ghApiGet } = {}) {
  const signature = entry.signature;
  if (!signature) return [];

  if (signature.type === "pr-title") {
    const latestCommit = signature.observe === LATEST_MATCHING_COMMIT;
    const pattern = new RegExp(signature.pattern);
    const prs =
      /** @type {Array<{title: string, number?: number, state?: string, headRefName?: string, createdAt?: string, mergedAt?: string|null}>} */ (
        ghClient.pr.list([
          "--search",
          signature.searchTerm,
          "--state",
          "all",
          "--json",
          latestCommit
            ? "title,createdAt,mergedAt,number,state,headRefName"
            : "title,createdAt,mergedAt",
          "--limit",
          "50",
        ])
      );
    return prs.map((pr) => ({
      type: "pr",
      title: pr.title,
      observedAt: !latestCommit
        ? (pr.mergedAt ?? pr.createdAt)
        : pattern.test(pr.title ?? "")
          ? latestMatchingCommitAt(
              { ...pr, commits: fetchPrCommits(apiGet, pr, pattern) },
              signature
            )
          : pr.createdAt,
    }));
  }

  if (signature.type === "issue-label") {
    const issues =
      /** @type {Array<{title: string, labels?: Array<{name: string}|string>, createdAt?: string}>} */ (
        ghClient.issue.list([
          "--label",
          signature.label,
          "--state",
          "all",
          "--json",
          "title,labels,createdAt",
          "--limit",
          "50",
        ])
      );
    return issues.map((issue) => ({
      type: "issue",
      labels: (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name)),
      observedAt: issue.createdAt,
    }));
  }

  return [];
}

/** Parses the issue number out of the URL `gh issue create` prints on success. */
function parseIssueNumberFromUrl(url) {
  const match = url.match(/\/issues\/(\d+)\s*$/);
  if (!match) throw new Error(`gh issue create returned unexpected output: ${url}`);
  return parseInt(match[1], 10);
}

/** Real `getIssueState` dep for `decideIssueTransition()`, backed by `gh issue view`. */
function getIssueStateViaGhClient(ghClient, issueNumber) {
  try {
    const state = String(ghClient.issue.view(issueNumber, ["--json", "state"]).state).toLowerCase();
    return state === "open" ? "open" : state === "closed" ? "closed" : "missing";
  } catch {
    return "missing";
  }
}

function main() {
  const ghClient = createGhClient();

  console.error(
    `Checking liveness of ${ROUTINE_MANIFEST.filter((e) => !e.outOfScope).length} routine(s).`
  );

  const results = runRoutineLivenessCheck({
    manifest: ROUTINE_MANIFEST,
    fetchObservedArtifacts: (entry) => fetchObservedArtifactsViaGhClient(ghClient, entry),
    now: new Date().toISOString(),
    // Scoped to this producer's own title namespace, and limited explicitly.
    // `gh issue list` defaults to 30 rows — against a repo creating ~2.7 ci-fix
    // issues a day, that page covers about eleven days, so a bare `--label
    // ci-fix` search loses sight of its own prior issues and re-files them
    // roughly every eleven days, forever. Searching the title prefix bounds the
    // page by producer rather than by recency.
    searchCiFixIssues: () =>
      ghClient.issue.list([
        "--search",
        '"ci-fix: routine" in:title',
        "--state",
        "all",
        "--limit",
        "200",
        "--json",
        "number,title",
      ]),
    getIssueState: (issueNumber) => getIssueStateViaGhClient(ghClient, issueNumber),
    createIssue: (title, body) =>
      parseIssueNumberFromUrl(ghClient.issue.create(buildRoutineFindingCreateArgs(title, body))),
    closeIssue: (issueNumber, comment) =>
      ghClient.issue.close(issueNumber, ["--reason", "completed", "--comment", comment]),
    runId: process.env.GITHUB_RUN_ID,
    log: (msg) => console.error(msg),
  });

  const findings = results.filter((r) => r.status === "dark" || r.status === "unverifiable");
  if (findings.length > 0) {
    console.error(`${findings.length} routine(s) flagged (dark or unverifiable).`);
  }

  // A routine whose observation failed was not classified: finish the run for
  // every other routine, then fail the job so the gap is visible (review N1).
  const unobserved = results.filter((r) => r.action === "observe-failed");
  if (unobserved.length > 0) {
    console.error(`${unobserved.length} routine(s) could not be observed this run.`);
    process.exitCode = 1;
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
