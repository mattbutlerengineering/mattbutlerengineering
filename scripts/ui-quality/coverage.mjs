#!/usr/bin/env node
/**
 * coverage.mjs — the SC-1 number: the share of reachable route templates
 * audited in the trailing 30 days (docs/features/ui-quality-loop/architecture.md
 * § Components "Coverage report").
 *
 *   denominator = auditable rows (page | not-found) minus `unreachable:*` rows
 *                 (listed by reason). `unjudged:*` rows STAY in it and are listed
 *                 under their own heading — reached but not judged is a coverage
 *                 gap, not an unreachable route. Redirect rows are never due
 *                 (ledger-audit.mjs AUDITABLE_KINDS), so never counted.
 *   numerator   = rows with `reachability: audited` and `last_audited_at` within
 *                 30 days of `now`.
 *
 * Provisional until 30 days after the earliest row of
 * metrics/ui-quality-runs.jsonl: exit 0 with the figure marked provisional.
 * With no runs row at all nothing has been audited by the loop, so the figure is
 * 0 — never 100 %. After the mark, exit 1 below 100 %.
 *
 * Deliberately NOT a scripts/check-*.mjs: that prefix means "wired into
 * repo-audit, fails the build", and a coverage lapse caused by a skipped fire
 * must not red every PR (same reasoning as metrics-freshness.mjs).
 *
 * Usage: node scripts/ui-quality/coverage.mjs [--json] [--now <iso>] [--root <dir>]
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "../lib/fitness-check.mjs";
import { read } from "../metrics-store.mjs";
import { AUDITABLE_KINDS } from "./ledger-audit.mjs";
import { LEDGER_METRIC, RUNS_METRIC } from "./ledger.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const COVERAGE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const label = (row) => `${row.app} ${row.route}`;

/** reason → row labels, reasons sorted. */
function groupByReason(rows) {
  const groups = {};
  for (const row of rows) (groups[row.reachability] ??= []).push(label(row));
  return Object.fromEntries(
    Object.keys(groups)
      .sort()
      .map((k) => [k, groups[k]])
  );
}

/**
 * @param {object[]} rows - ledger rows
 * @param {object[]} runs - runs rows (only `ts` is read)
 * @param {string} now - ISO timestamp
 */
export function computeCoverage(rows, runs, now) {
  const nowMs = Date.parse(now);
  const firstRunAt =
    runs
      .map((r) => r.ts)
      .filter(Boolean)
      .sort()[0] ?? null;
  const provisional =
    firstRunAt === null || nowMs < Date.parse(firstRunAt) + COVERAGE_WINDOW_DAYS * DAY_MS;

  const auditable = rows.filter((r) => AUDITABLE_KINDS.includes(r.kind));
  const unreachable = auditable.filter((r) => r.reachability?.startsWith("unreachable:"));
  const counted = auditable.filter((r) => !r.reachability?.startsWith("unreachable:"));
  const isCovered = (r) =>
    firstRunAt !== null &&
    r.reachability === "audited" &&
    nowMs - Date.parse(r.last_audited_at) <= COVERAGE_WINDOW_DAYS * DAY_MS;
  const covered = counted.filter(isCovered);
  const uncovered = counted.filter((r) => !isCovered(r));
  const percent =
    counted.length === 0 ? 0 : Math.floor((covered.length / counted.length) * 1000) / 10;

  return {
    percent,
    provisional,
    first_run_at: firstRunAt,
    covered: covered.length,
    denominator: counted.length,
    uncovered: uncovered.filter((r) => !r.reachability?.startsWith("unjudged:")).map(label),
    unjudged: groupByReason(uncovered.filter((r) => r.reachability?.startsWith("unjudged:"))),
    unreachable: groupByReason(unreachable),
  };
}

function printGroups(stdout, groups) {
  for (const [reason, labels] of Object.entries(groups)) {
    stdout(`  ${reason} (${labels.length}):\n`);
    for (const l of labels) stdout(`    ${l}\n`);
  }
}

/** @returns {number} exit code */
export function main(argv, deps = {}) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const root = flag("--root") ? resolve(flag("--root")) : (deps.root ?? DEFAULT_ROOT);
  const stdout = deps.stdout ?? ((s) => process.stdout.write(s));
  const now = flag("--now") ?? deps.now?.() ?? new Date().toISOString();

  const report = computeCoverage(
    read(LEDGER_METRIC, { root }) ?? [],
    read(RUNS_METRIC, { root }) ?? [],
    now
  );
  const failing = !report.provisional && report.percent < 100;

  if (argv.includes("--json")) {
    stdout(JSON.stringify(report, null, 2) + "\n");
    return failing ? 1 : 0;
  }

  const figure = `${report.percent} % (${report.covered}/${report.denominator} reachable routes audited in the last ${COVERAGE_WINDOW_DAYS} days)`;
  const since = report.first_run_at ? `first run ${report.first_run_at}` : "no fire recorded yet";
  if (Object.keys(report.unjudged).length > 0) {
    stdout("Unjudged (reached, not judged — counted as not covered):\n");
    printGroups(stdout, report.unjudged);
  }
  if (Object.keys(report.unreachable).length > 0) {
    stdout("Unreachable (excluded from the denominator):\n");
    printGroups(stdout, report.unreachable);
  }
  return runCheck({
    name: "ui-quality coverage",
    // Every counted-but-not-covered row fails the check, unjudged ones included.
    findings: failing
      ? [
          ...report.uncovered.map((l) => `not audited in window: ${l}`),
          ...Object.entries(report.unjudged).flatMap(([reason, labels]) =>
            labels.map((l) => `${reason}: ${l}`)
          ),
        ]
      : [],
    formatFinding: (line) => line,
    passMessage: report.provisional
      ? `PROVISIONAL: ui-quality coverage ${figure} — ${since}; binding ${COVERAGE_WINDOW_DAYS} days after the first run`
      : `PASS: ui-quality coverage ${figure}`,
    failMessage: `FAIL: ui-quality coverage ${figure}:`,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
