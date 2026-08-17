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

import { execFileSync } from "node:child_process";

import { createGhClient } from "@mbe/gh-client";

import { append } from "./metrics-store.mjs";

/** Default staleness threshold, in days. */
export const STALE_THRESHOLD_DAYS = 14;

/** Default staleness threshold, in milliseconds. */
export const STALE_THRESHOLD_MS = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/** Labels that age by design — excluded even when otherwise stale. */
export const EXCLUDED_LABELS = ["vetoed", "deferred", "wontfix", "tracking", "ideation-batch"];

/** Label applied to a qualifying issue as the surfacing mechanism. */
export const READY_FOR_HUMAN_LABEL = "ready-for-human";

/** `scripts/metrics-store.mjs` registry key for this run's measurements. */
export const STALE_METRICS_KEY = "stale-human-blocked";

/** Where each run records what it measured, one JSON object per line. */
export const STALE_METRICS_PATH = "metrics/stale-human-blocked.jsonl";

/**
 * Timeline event types that are label writes and nothing else. A run of this
 * workflow emits exactly these, so counting them as activity would make the
 * detector erase the staleness it just measured (#4274).
 */
export const LABEL_ONLY_EVENTS = ["labeled", "unlabeled"];

/** Fields required for `gh issue list --json`. */
export const ISSUE_JSON_FIELDS = "number,title,state,updatedAt,labels,createdAt,comments";

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

/** Parses an ISO timestamp from either a REST (`created_at`) or gh CLI (`createdAt`) shape. */
function eventTimeMs(record) {
  return Date.parse(record?.created_at ?? record?.createdAt ?? "");
}

/**
 * Pure: the most recent timestamp at which a *human* touched `issue`.
 *
 * Deliberately blind to label activity. `updatedAt` cannot be used for this:
 * applying `ready-for-human` bumps it, so a detector that read `updatedAt`
 * would report every issue it labeled as touched-today on the next run and
 * rank the most-ignored issues last (#4274). Derived instead from the latest
 * of: issue creation, the last comment, and the last timeline event whose
 * type is not in {@link LABEL_ONLY_EVENTS}.
 *
 * @param {{createdAt?:string, comments?:Array}} issue
 * @param {Array<{event?:string, created_at?:string, createdAt?:string}>} [timelineEvents]
 * @returns {string|null} ISO 8601 timestamp, or null if nothing parseable
 */
export function lastHumanTouchAt(issue, timelineEvents = []) {
  const candidates = [
    Date.parse(issue?.createdAt ?? ""),
    ...(issue?.comments ?? []).map(eventTimeMs),
    ...(timelineEvents ?? [])
      .filter((e) => !LABEL_ONLY_EVENTS.includes(String(e?.event ?? "")))
      .map(eventTimeMs),
  ].filter((ms) => Number.isFinite(ms));

  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates)).toISOString();
}

/**
 * Pure: whole days between `lastTouchIso` and `nowMs`, floored, never negative.
 *
 * @param {string|null} lastTouchIso
 * @param {number} nowMs
 * @returns {number|null} null when `lastTouchIso` is missing or unparseable
 */
export function daysStale(lastTouchIso, nowMs) {
  const touchedMs = Date.parse(lastTouchIso ?? "");
  if (!Number.isFinite(touchedMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.floor((nowMs - touchedMs) / (24 * 60 * 60 * 1000)));
}

/**
 * Pure: the metrics row recorded for one qualifying issue, before any label
 * write. `labeled` records whether *this* run applied the label or skipped it
 * as already-present — the skipped ones are the rows whose `updatedAt` is
 * still trustworthy, which is worth being able to tell apart later.
 *
 * @param {{issue:object, timelineEvents?:Array, nowMs:number, labeled:boolean}} args
 */
export function buildStaleMetricRow({ issue, timelineEvents = [], nowMs, labeled }) {
  const lastTouch = lastHumanTouchAt(issue, timelineEvents);
  return {
    issue: issue?.number ?? null,
    last_human_touch_at: lastTouch,
    days_stale: daysStale(lastTouch, nowMs),
    detected_at: new Date(nowMs).toISOString(),
    labeled,
  };
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
 * Each qualifying issue's measured staleness is recorded via `recordMetric`
 * *before* that issue's label write — the label bumps `updatedAt`, so the
 * measurement has to be persisted while it is still recoverable (#4274).
 *
 * @param {{
 *   listOpenIssues: () => Promise<Array>,
 *   applyLabel: (number:number) => Promise<void>,
 *   fetchTimeline?: (number:number) => Promise<Array>,
 *   recordMetric?: (row:object) => Promise<void>,
 *   now?: number,
 *   thresholdMs?: number,
 *   dryRun?: boolean,
 *   log?: (msg:string) => void,
 * }} deps
 * @returns {Promise<{stale:number[], labeled:number[], recorded:object[]}>}
 */
export async function runStaleHumanBlocked({
  listOpenIssues,
  applyLabel,
  fetchTimeline = async () => [],
  recordMetric = async () => {},
  now = Date.now(),
  thresholdMs = STALE_THRESHOLD_MS,
  dryRun = false,
  log = () => {},
}) {
  const issues = await listOpenIssues();
  const stale = findStaleHumanBlockedIssues(issues, now, { thresholdMs });

  const labeled = [];
  const recorded = [];
  for (const issue of stale) {
    const alreadyLabeled = hasLabel(issue, READY_FOR_HUMAN_LABEL);
    if (alreadyLabeled) {
      log(`#${issue.number} already labeled ${READY_FOR_HUMAN_LABEL} — skipping`);
    } else if (dryRun) {
      log(`[dry-run] would label #${issue.number} ${READY_FOR_HUMAN_LABEL}`);
    }

    // --dry-run is a read: no label write, and no metrics write either.
    if (dryRun) continue;

    const timelineEvents = await fetchTimeline(issue.number);
    const row = buildStaleMetricRow({
      issue,
      timelineEvents,
      nowMs: now,
      labeled: !alreadyLabeled,
    });
    await recordMetric(row);
    recorded.push(row);

    if (alreadyLabeled) continue;

    await applyLabel(issue.number);
    labeled.push(issue.number);
    log(`labeled #${issue.number} ${READY_FOR_HUMAN_LABEL}`);
  }

  return { stale: stale.map((i) => i.number), labeled, recorded };
}

/**
 * Fetches one issue's timeline. `gh issue list --json` exposes comments but no
 * timeline, and `@mbe/gh-client` has no generic REST facet, so this is a local
 * `gh api` call rather than a new client method — it is the only caller.
 *
 * Degrades to `[]` (with a warning) rather than throwing: a timeline that
 * cannot be read costs precision in `last_human_touch_at`, which still has
 * creation time and comments to fall back on. Failing the whole labeling run
 * over it would trade a real job for a metrics detail.
 */
function fetchIssueTimeline(number, log = () => {}) {
  try {
    const raw = execFileSync(
      "gh",
      ["api", `repos/{owner}/{repo}/issues/${number}/timeline`, "--paginate"],
      { encoding: "utf8", timeout: 30_000 }
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    log(`timeline unavailable for #${number} (${err.message}) — using creation + comments only`);
    return [];
  }
}

/** CLI entry: wires the real gh client to {@link runStaleHumanBlocked}. */
async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const gh = createGhClient({ timeoutMs: 30_000 });
  const log = (msg) => console.log(`[stale-human-blocked] ${msg}`);

  const result = await runStaleHumanBlocked({
    listOpenIssues: async () =>
      gh.issue.list(["--state", "open", "--json", ISSUE_JSON_FIELDS, "--limit", "500"]),
    applyLabel: async (number) =>
      gh.label.apply({ issueNumber: number, add: [READY_FOR_HUMAN_LABEL], remove: [] }),
    fetchTimeline: async (number) => fetchIssueTimeline(number, log),
    recordMetric: async (row) => append(STALE_METRICS_KEY, row),
    dryRun,
    log,
  });

  const recordedSummary = dryRun
    ? ""
    : `, recorded ${result.recorded.length} row(s) to ${STALE_METRICS_PATH}`;
  console.log(
    `[stale-human-blocked] ${dryRun ? "[dry-run] " : ""}found ${result.stale.length} stale issue(s), labeled ${
      result.labeled.length
    }${recordedSummary}: ${result.stale.map((n) => `#${n}`).join(", ") || "none"}`
  );
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    process.stderr.write(`[stale-human-blocked] Error: ${err.message}\n`);
    process.exit(1);
  });
}
