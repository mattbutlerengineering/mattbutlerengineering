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
 * side by side. Does not depend on the `gh` CLI — `@mbe/gh-client` falls
 * back to the GitHub REST API when `gh` is unavailable (Claude Code Remote
 * sessions; see .claude/rules/gotchas.md § Claude Code Remote).
 *
 * Usage:
 *   node scripts/routine-liveness.mjs
 */

import { fileURLToPath } from "node:url";
import { createGhClient, COORDINATION_LABELS } from "@mbe/gh-client";
import { fileIssue } from "./lib/issue-filing.mjs";
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
 *
 * @param {{
 *   signature?: import("./routine-manifest.mjs").RoutineSignature,
 *   periodDays: number,
 *   observedArtifacts?: Array<{type?: string, title?: string, labels?: string[], observedAt?: string}>,
 *   now: string|number|Date,
 * }} args
 * @returns {{status: "alive"|"late"|"dark"|"unverifiable", matched: object|null}}
 */
export function classifyRoutineLiveness({ signature, periodDays, observedArtifacts = [], now }) {
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
 * Pure: finds a prior finding issue for `routineName` among candidate issues
 * (any state).
 *
 * @param {Array<{number: number, title: string}>} candidates
 * @param {string} routineName
 * @returns {number | null}
 */
export function findPriorRoutineFindingIssue(candidates, routineName) {
  const match = (candidates ?? []).find(
    (issue) => extractRoutineNameFromIssueTitle(issue) === routineName
  );
  return match ? match.number : null;
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
 * (scheduled-workflow-health.mjs). For every other entry: classify, and on
 * `dark` or `unverifiable`, file (or dedupe against) one `ci-fix` issue via
 * the shared `fileIssue()` seam — at most one open issue per routine.
 *
 * @param {{
 *   manifest: import("./routine-manifest.mjs").RoutineManifestEntry[],
 *   fetchObservedArtifacts: (entry: object) => Array<object>,
 *   now: string|number|Date,
 *   searchCiFixIssues?: () => Array<{number: number, title: string}>,
 *   getIssueState?: (issueNumber: number) => "open"|"closed"|"missing",
 *   createIssue: (title: string, body: string, labels: string[]) => number,
 *   reopenIssue?: (issueNumber: number) => void,
 *   log?: (msg: string) => void,
 * }} deps
 * @returns {Array<{routine: string, status: string, action?: string, issueNumber?: number}>}
 */
export function runRoutineLivenessCheck({
  manifest,
  fetchObservedArtifacts,
  now,
  searchCiFixIssues = () => [],
  getIssueState = () => "missing",
  createIssue,
  reopenIssue = () => {},
  log = () => {},
}) {
  return manifest
    .filter((entry) => !entry.outOfScope)
    .map((entry) => {
      const observedArtifacts = entry.signature ? fetchObservedArtifacts(entry) : [];
      const result = classifyRoutineLiveness({
        signature: entry.signature,
        periodDays: entry.periodDays,
        observedArtifacts,
        now,
      });

      if (result.status !== "dark" && result.status !== "unverifiable") {
        return { routine: entry.name, status: result.status };
      }

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

      // A failed search must not swallow a genuine dark/unverifiable finding
      // — fail open (treat as "no prior found", file the issue) rather than closed.
      let candidates = [];
      try {
        candidates = searchCiFixIssues();
      } catch (err) {
        log(
          `search for a prior routine-liveness issue failed, proceeding as no-match: ${err.message}`
        );
      }
      const priorNumber = findPriorRoutineFindingIssue(candidates, entry.name);
      const ledger = priorNumber !== null ? { [entry.name]: priorNumber } : {};

      const fileResult = fileIssue({ title, body, labels, dedupeKey: entry.name }, ledger, {
        getIssueState,
        createIssue,
        reopenIssue,
      });

      log(
        fileResult.action === "skip"
          ? `Issue #${fileResult.issueNumber} already tracks ${entry.name}'s ${result.status} liveness — skipping.`
          : fileResult.action === "reopen"
            ? `Reopened issue #${fileResult.issueNumber} for ${entry.name}'s ${result.status} liveness.`
            : `Created issue #${fileResult.issueNumber} for ${entry.name}'s ${result.status} liveness.`
      );

      return {
        routine: entry.name,
        status: result.status,
        action: fileResult.action,
        issueNumber: fileResult.issueNumber,
      };
    });
}

/**
 * Fetches observed artifacts for one manifest entry via a real `@mbe/gh-client`
 * instance. Search results are capped at 50 and not date-sorted server-side
 * (the REST search fallback doesn't set `sort=created`) — acceptable here
 * because `classifyRoutineLiveness()` only needs the single most-recent
 * match, not a complete history.
 *
 * @param {ReturnType<typeof createGhClient>} ghClient
 * @param {import("./routine-manifest.mjs").RoutineManifestEntry} entry
 * @returns {Array<{type: string, title?: string, labels?: string[], observedAt?: string}>}
 */
export function fetchObservedArtifactsViaGhClient(ghClient, entry) {
  const signature = entry.signature;
  if (!signature) return [];

  if (signature.type === "pr-title") {
    const prs = /** @type {Array<{title: string, createdAt?: string, mergedAt?: string|null}>} */ (
      ghClient.pr.list([
        "--search",
        signature.searchTerm,
        "--state",
        "all",
        "--json",
        "title,createdAt,mergedAt",
        "--limit",
        "50",
      ])
    );
    return prs.map((pr) => ({
      type: "pr",
      title: pr.title,
      observedAt: pr.mergedAt ?? pr.createdAt,
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

/** Real `getIssueState` dep for `fileIssue()`, backed by `gh issue view`. */
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
    searchCiFixIssues: () =>
      ghClient.issue.list(["--label", "ci-fix", "--state", "all", "--json", "number,title"]),
    getIssueState: (issueNumber) => getIssueStateViaGhClient(ghClient, issueNumber),
    createIssue: (title, body) =>
      parseIssueNumberFromUrl(ghClient.issue.create(buildRoutineFindingCreateArgs(title, body))),
    reopenIssue: (issueNumber) => ghClient.issue.reopen(issueNumber),
    log: (msg) => console.error(msg),
  });

  const findings = results.filter((r) => r.status === "dark" || r.status === "unverifiable");
  if (findings.length > 0) {
    console.error(`${findings.length} routine(s) flagged (dark or unverifiable).`);
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
