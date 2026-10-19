#!/usr/bin/env node

/**
 * Read-side verdict for `metrics/stale-human-blocked.jsonl` (#7091).
 *
 * `mbe-weekly-retro` Pass 2 orders the human-blocked backlog from the file's
 * latest `detected_at` batch. That file is append-only and the detector
 * (`stale-human-blocked.yml`) writes nothing on a clean week, so four clean
 * weeks are byte-identical to a dead collector: on 2026-10-18 the "latest"
 * batch was four Sundays old and every one of its nine issues was closed.
 * Handing a caller raw rows lets it escalate dead issues, so this returns a
 * verdict, and only a `fresh` verdict carries ordering data.
 *
 * Age never comes from `updatedAt` (#4274, #5816): ages are the persisted
 * `days_stale`, and an open issue with no row in the batch is reported with
 * age `unknown`.
 *
 * Usage: node scripts/stale-human-blocked-latest.mjs --open 4111,3978 [--file <path>]
 *   `--open` is the label-query membership (the open issues the retro lists);
 *   a row whose issue is not in it is treated as closed.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The detector runs weekly; tolerance absorbs scheduled-run start drift. */
export const DETECTOR_PERIOD_DAYS = 7;
export const DEFAULT_TOLERANCE_DAYS = 2;

/**
 * @param {{ rows: unknown, openIssues?: number[], nowMs: number, toleranceDays?: number }} input
 *   `rows` null/undefined means the file does not exist.
 * @returns {{ verdict: "fresh"|"stale"|"empty"|"all-closed"|"missing", usable: boolean,
 *   detectedAt: string|null, ordered: object[], unknown: {issue:number, age:"unknown"}[] }}
 */
export function classifyLatestBatch({
  rows,
  openIssues = [],
  nowMs,
  toleranceDays = DEFAULT_TOLERANCE_DAYS,
}) {
  const open = new Set(openIssues);
  const allUnknown = [...open].map((issue) => ({ issue, age: "unknown" }));
  const reject = (verdict, detectedAt = null) => ({
    verdict,
    usable: false,
    detectedAt,
    ordered: [],
    unknown: allUnknown,
  });

  if (!Array.isArray(rows)) return reject("missing");

  const dated = rows
    .map((row) => ({ row, ms: Date.parse(row?.detected_at) }))
    .filter(({ ms }) => Number.isFinite(ms));
  if (dated.length === 0) return reject(rows.length === 0 ? "empty" : "stale");

  const latestMs = Math.max(...dated.map(({ ms }) => ms));
  const detectedAt = new Date(latestMs).toISOString();
  if (!(nowMs - latestMs <= (DETECTOR_PERIOD_DAYS + toleranceDays) * DAY_MS)) {
    return reject("stale", detectedAt);
  }

  const batch = dated.filter(({ ms }) => ms === latestMs).map(({ row }) => row);
  const live = batch.filter((row) => open.has(row.issue));
  if (live.length === 0) return reject("all-closed", detectedAt);

  const rowIssues = new Set(live.map((row) => row.issue));
  return {
    verdict: "fresh",
    usable: true,
    detectedAt,
    ordered: [...live].sort((a, b) => b.days_stale - a.days_stale),
    unknown: allUnknown.filter(({ issue }) => !rowIssues.has(issue)),
  };
}

export function parseJsonl(text) {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

/* ── CLI ─────────────────────────────────────────────────── */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const file = arg("--file") ?? "metrics/stale-human-blocked.jsonl";
  const openIssues = (arg("--open") ?? "").split(",").filter(Boolean).map(Number);
  let rows = null;
  if (existsSync(file)) {
    try {
      rows = parseJsonl(readFileSync(file, "utf8"));
    } catch {
      rows = null;
    }
  }
  process.stdout.write(
    `${JSON.stringify(classifyLatestBatch({ rows, openIssues, nowMs: Date.now() }), null, 2)}\n`
  );
}
