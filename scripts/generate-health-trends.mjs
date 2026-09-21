#!/usr/bin/env node

/**
 * Projects the two committed, append-only self-improvement histories into
 * `apps/marketing/public/ai-health-trends.json` — the trailing-window series
 * the public AI-health page charts (#5443).
 *
 * Sources, both already git-tracked and both refreshed daily:
 *   - `.claude/acmm/state.json` `history[]`      -> ACMM maturity level per day
 *   - `metrics/process-metrics.jsonl`            -> `queueEfficiency` composite
 *
 * Written next to `apps/marketing/public/sensor-report.json` by the same
 * `scripts/sensor-report.mjs` run, so the page's trend panels can never be
 * fresher or staler than its snapshot panels. The output path is declared in
 * `metrics-store.mjs`'s `DURABLE_OUTSIDE`, which is what makes
 * `persist-metrics.mjs` stage it on the daily routines.
 *
 * A day the collector could not measure is published as an explicit hole
 * (`value: null` plus the recorded `note`), never dropped and never
 * interpolated: this feeds the one page whose stated purpose is honesty about
 * self-improvement, so a missing measurement has to read as missing.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** Trailing window the page charts — the issue's "~30-60 days". */
export const TREND_WINDOW_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The inclusive first `YYYY-MM-DD` of a `days`-long window ending on `today`.
 *
 * Arithmetic is done on the UTC epoch and formatted back through
 * `toISOString()`, so a macOS-local run and a CI-UTC run agree on the
 * boundary — a local-timezone `Date` would shift it by a day west of UTC.
 *
 * @param {string} today - ISO date, `YYYY-MM-DD`.
 * @param {number} days
 * @returns {string} ISO date, `YYYY-MM-DD`.
 */
export function windowStartDate(today, days) {
  const end = Date.parse(`${today}T00:00:00Z`);
  return new Date(end - days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Trailing-window projection shared by both series: keeps points dated inside
 * the window, oldest first, collapsing a repeated date to its last entry.
 *
 * Both sources are append-only and neither rewrites a line, so a date
 * appearing twice (`metrics/process-metrics.jsonl` really does carry two
 * `2026-08-11` rows) means the later append is the corrected reading.
 * Comparison is plain ISO string ordering — never `localeCompare`, whose
 * collation is locale-sensitive and would make the artifact host-dependent.
 *
 * @template {{ date?: unknown }} T
 * @param {readonly T[]} points
 * @param {{ windowDays?: number, today: string }} options
 * @returns {T[]}
 */
export function selectTrendWindow(points, { windowDays = TREND_WINDOW_DAYS, today }) {
  const start = windowStartDate(today, windowDays);
  const byDate = new Map();

  for (const point of Array.isArray(points) ? points : []) {
    const date = point?.date;
    if (typeof date !== "string" || !ISO_DATE.test(date)) continue;
    if (date < start) continue;
    byDate.set(date, point);
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * ACMM maturity level per day, from `.claude/acmm/state.json`'s `history`.
 *
 * @param {unknown} history
 * @param {{ windowDays?: number, today: string }} options
 * @returns {Array<{ date: string, value: number | null, note: string | null }>}
 */
export function buildAcmmSeries(history, options) {
  return selectTrendWindow(Array.isArray(history) ? history : [], options).map((entry) =>
    typeof entry.level === "number"
      ? { date: entry.date, value: entry.level, note: null }
      : { date: entry.date, value: null, note: "no_level_recorded" }
  );
}

/**
 * `queueEfficiency` composite per day, from `metrics/process-metrics.jsonl`
 * rows. An `available: false` row keeps its `reason` as the hole's note —
 * that is how `2026-09-15`'s `query_error` reaches the page as a gap rather
 * than as a silently absent day.
 *
 * @param {readonly Record<string, unknown>[]} rows
 * @param {{ windowDays?: number, today: string }} options
 * @returns {Array<{ date: string, value: number | null, note: string | null }>}
 */
export function buildQueueEfficiencySeries(rows, options) {
  const queueRows = (Array.isArray(rows) ? rows : []).filter(
    (row) => row?.sensor === "queueEfficiency"
  );

  return selectTrendWindow(queueRows, options).map((row) => {
    if (row.available !== true) {
      return {
        date: row.date,
        value: null,
        note: typeof row.reason === "string" ? row.reason : "unavailable",
      };
    }
    return typeof row.composite === "number"
      ? { date: row.date, value: row.composite, note: null }
      : { date: row.date, value: null, note: "no_composite_recorded" };
  });
}

/**
 * Parses a `.jsonl` file into rows, skipping blank and unparseable lines. The
 * file is appended to concurrently by local and cloud routines under
 * `merge=union`, so a torn line is a real possibility and must not abort the
 * whole projection.
 *
 * @param {string} text
 * @returns {Record<string, unknown>[]}
 */
function parseJsonl(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  return rows;
}

/**
 * Reads a file, returning `fallback` when it is absent or unreadable — a
 * fresh or ephemeral checkout legitimately has neither history yet.
 *
 * @param {string} path
 * @param {string} fallback
 * @returns {string}
 */
function readOrFallback(path, fallback) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return fallback;
  }
}

/**
 * The ACMM state file's `history` array, or `[]` when the file is absent or
 * not parseable JSON.
 *
 * @param {string} root
 * @returns {unknown}
 */
function readAcmmHistory(root) {
  try {
    return JSON.parse(readOrFallback(resolve(root, ".claude/acmm/state.json"), "{}"))?.history;
  } catch {
    return [];
  }
}

/**
 * Reads both committed histories and projects them into the published
 * payload. Root-injectable, mirroring `metrics-store.mjs`'s DI style, so
 * tests never touch the real repo files.
 *
 * @param {{ root?: string, now?: Date, windowDays?: number }} [options]
 */
export function buildHealthTrends({ root = ROOT, now = new Date(), windowDays } = {}) {
  const today = now.toISOString().slice(0, 10);
  const options = { windowDays, today };

  const acmmHistory = readAcmmHistory(root);
  const processRows = parseJsonl(
    readOrFallback(resolve(root, "metrics/process-metrics.jsonl"), "")
  );

  return {
    generated_at: now.toISOString(),
    window_days: windowDays ?? TREND_WINDOW_DAYS,
    acmmLevel: {
      label: "ACMM maturity level",
      source: ".claude/acmm/state.json",
      points: buildAcmmSeries(acmmHistory, options),
    },
    queueEfficiency: {
      label: "Queue efficiency composite",
      source: "metrics/process-metrics.jsonl",
      points: buildQueueEfficiencySeries(processRows, options),
    },
  };
}

/**
 * Writes the payload the AI-health page fetches.
 *
 * @param {object} trends
 * @param {{ root?: string }} [options]
 * @returns {string} the resolved output path
 */
export function writeHealthTrends(trends, { root = ROOT } = {}) {
  const outPath = resolve(root, "apps/marketing/public/ai-health-trends.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(trends, null, 2) + "\n");
  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${writeHealthTrends(buildHealthTrends())}\n`);
}
