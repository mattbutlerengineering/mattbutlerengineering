#!/usr/bin/env node
/**
 * stale-human-blocked.mjs — detect stale human-blocked issues by behaviour,
 * not by label (#4043).
 *
 * The weekly retro's backlog-aging pass finds human-blocked work with a
 * fixed label query (`ready-for-human`, `needs-review`, `blocked`,
 * `agent-failed`, `stealable`) — see `docs/process-retro.md` § Pass 2. That
 * query is only as good as the label the filer happened to apply. #3322 sat
 * untouched for 30 days carrying only `ci-fix` and was invisible to three
 * consecutive weekly retros as a result.
 *
 * This module detects on behaviour instead: any *open* issue whose
 * `updatedAt` hasn't moved in `thresholdMs`, independent of which (if any)
 * blocker label it carries — mirroring the shape of `auto-retry-stale.mjs`'s
 * `selectStaleForRetry`. Issues that age by design (`vetoed`, `deferred`,
 * `wontfix`, `tracking`, `ideation-batch`) are excluded.
 *
 * The label-based query in the weekly retro is not removed; this is
 * additive. Surfacing mechanism: applying `ready-for-human` directly to each
 * qualifying issue (rather than a digest issue) — see the PR description for
 * the rationale. Applying a label the issue already carries is a no-op, so
 * re-running this on an unchanged backlog changes nothing (idempotent).
 */

import { createGhClient } from "@mbe/gh-client";

/** Default staleness threshold, in days. */
export const STALE_THRESHOLD_DAYS = 14;

/** Default staleness threshold, in milliseconds. */
export const STALE_THRESHOLD_MS = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/** Labels that age by design — excluded even when otherwise stale. */
export const EXCLUDED_LABELS = ["vetoed", "deferred", "wontfix", "tracking", "ideation-batch"];

/** Label applied to a qualifying issue as the surfacing mechanism. */
export const READY_FOR_HUMAN_LABEL = "ready-for-human";

/** Fields required for `gh issue list --json`. */
export const ISSUE_JSON_FIELDS = "number,title,state,updatedAt,labels";

/** True if `issue` carries `labelName` (supports `["x"]` or `[{name:"x"}]`). */
function hasLabel(issue, labelName) {
  const labels = issue?.labels ?? [];
  return labels.some((l) => (typeof l === "string" ? l : l?.name) === labelName);
}

/** True if `issue` carries any label in `labelNames`. */
function hasAnyLabel(issue, labelNames) {
  return labelNames.some((name) => hasLabel(issue, name));
}

/** True if `issue.state` is "open" (case-insensitive — gh CLI returns "OPEN"). */
function isOpen(issue) {
  return String(issue?.state ?? "").toUpperCase() === "OPEN";
}

/**
 * Pure: open issues whose `updatedAt` is older than `thresholdMs`, excluding
 * any issue carrying an {@link EXCLUDED_LABELS} entry — independent of
 * whether a human-blocker label (`ready-for-human`, `blocked`, etc.) is
 * present. This is the #3322 case: that issue carried none of those labels
 * and was invisible to the label-based weekly-retro query for three
 * consecutive weeks.
 *
 * @param {Array<{number:number,title:string,state:string,updatedAt:string,labels:Array}>} issues
 * @param {number} nowMs - reference timestamp in ms (injected for determinism)
 * @param {{thresholdMs?:number}} [opts]
 * @returns {Array} new array, most-stale first; input is not mutated
 */
export function findStaleHumanBlockedIssues(issues, nowMs, opts = {}) {
  const { thresholdMs = STALE_THRESHOLD_MS } = opts;
  return (issues ?? [])
    .filter((i) => isOpen(i))
    .filter((i) => !hasAnyLabel(i, EXCLUDED_LABELS))
    .map((i) => ({ issue: i, updatedMs: Date.parse(i?.updatedAt) }))
    .filter(({ updatedMs }) => Number.isFinite(updatedMs) && nowMs - updatedMs > thresholdMs)
    .sort((a, b) => a.updatedMs - b.updatedMs) // most-stale (oldest updatedAt) first
    .map(({ issue }) => issue);
}

/**
 * Finds stale human-blocked issues and applies {@link READY_FOR_HUMAN_LABEL}
 * to each one that doesn't already carry it.
 *
 * `listOpenIssues` is awaited without a try/catch: if it throws (e.g. an
 * unauthenticated `gh-client` — #3689/#3695), the rejection propagates to
 * the caller instead of being swallowed into an empty (falsely "all clear")
 * result — the failure mode this module exists to prevent.
 *
 * @param {{
 *   listOpenIssues: () => Promise<Array>,
 *   applyLabel: (number:number) => Promise<void>,
 *   now?: number,
 *   thresholdMs?: number,
 *   dryRun?: boolean,
 *   log?: (msg:string) => void,
 * }} deps
 * @returns {Promise<{stale:number[], labeled:number[]}>}
 */
export async function runStaleHumanBlocked({
  listOpenIssues,
  applyLabel,
  now = Date.now(),
  thresholdMs = STALE_THRESHOLD_MS,
  dryRun = false,
  log = () => {},
}) {
  const issues = await listOpenIssues();
  const stale = findStaleHumanBlockedIssues(issues, now, { thresholdMs });

  const labeled = [];
  for (const issue of stale) {
    if (hasLabel(issue, READY_FOR_HUMAN_LABEL)) {
      log(`#${issue.number} already labeled ${READY_FOR_HUMAN_LABEL} — skipping`);
      continue;
    }
    if (dryRun) {
      log(`[dry-run] would label #${issue.number} ${READY_FOR_HUMAN_LABEL}`);
      continue;
    }
    await applyLabel(issue.number);
    labeled.push(issue.number);
    log(`labeled #${issue.number} ${READY_FOR_HUMAN_LABEL}`);
  }

  return { stale: stale.map((i) => i.number), labeled };
}

/** CLI entry: wires the real gh client to {@link runStaleHumanBlocked}. */
async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const gh = createGhClient({ timeoutMs: 30_000 });

  const result = await runStaleHumanBlocked({
    listOpenIssues: async () =>
      gh.issue.list(["--state", "open", "--json", ISSUE_JSON_FIELDS, "--limit", "500"]),
    applyLabel: async (number) =>
      gh.label.apply({ issueNumber: number, add: [READY_FOR_HUMAN_LABEL], remove: [] }),
    dryRun,
    log: (msg) => console.log(`[stale-human-blocked] ${msg}`),
  });

  console.log(
    `[stale-human-blocked] ${dryRun ? "[dry-run] " : ""}found ${result.stale.length} stale issue(s), labeled ${
      result.labeled.length
    }: ${result.stale.map((n) => `#${n}`).join(", ") || "none"}`
  );
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    process.stderr.write(`[stale-human-blocked] Error: ${err.message}\n`);
    process.exit(1);
  });
}
