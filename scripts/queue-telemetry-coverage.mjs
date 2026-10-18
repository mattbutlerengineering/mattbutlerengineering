#!/usr/bin/env node

/**
 * Field-coverage summary for the queue-telemetry sink (#6943, part of #6895).
 *
 * `metrics-freshness.mjs` only checks that the sink's newest `claimed_at` is
 * recent, so a sink gaining rows that are 100% null on `cost_usd` passed every
 * day. This module counts, per reconcilable field:
 *   known    non-null value
 *   unknown  null WITH an `unknown_reasons` entry (honest: e.g. no-ledger-row)
 *   silent   null with NO reason: the reconciler did not run or did not finish
 *
 * Only `silent` is a failure signal. `unknown` is reported, never failed.
 *
 * Usage: node scripts/queue-telemetry-coverage.mjs [--days 7] [--markdown]
 */

import { fileURLToPath } from "node:url";
import { RECONCILABLE_FIELDS, readTelemetryRows } from "./queue-telemetry-store.mjs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const isNull = (v) => v === null || v === undefined;

/** Whether `row.field` is a silent null (null with no recorded reason). */
const isSilent = (row, field) => isNull(row[field]) && !row.unknown_reasons?.[field];

function inWindow(rows, since) {
  if (!since) return rows;
  const sinceMs = since.getTime();
  return rows.filter((r) => Date.parse(r.claimed_at) >= sinceMs);
}

/**
 * @param {object[]} rows
 * @param {{ since?: Date }} [opts] window by `claimed_at`
 */
export function summarizeFieldCoverage(rows, { since } = {}) {
  const windowed = inWindow(rows, since);
  const fields = {};
  for (const field of RECONCILABLE_FIELDS) {
    const stat = { known: 0, unknown: 0, silent: 0, unknown_by_reason: {} };
    for (const row of windowed) {
      if (!isNull(row[field])) stat.known += 1;
      else if (isSilent(row, field)) stat.silent += 1;
      else {
        stat.unknown += 1;
        const reason = row.unknown_reasons[field];
        stat.unknown_by_reason[reason] = (stat.unknown_by_reason[reason] ?? 0) + 1;
      }
    }
    fields[field] = stat;
  }
  return { rows_n: windowed.length, fields };
}

/** Rows carrying at least one silent null on a reconcilable field. */
export function silentRowCount(rows) {
  return rows.filter((row) => RECONCILABLE_FIELDS.some((f) => isSilent(row, f))).length;
}

export function formatCoverageMarkdown(summary) {
  const lines = [
    `Rows: ${summary.rows_n}`,
    "",
    "| field | known | unknown | silent | unknown by reason |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const [field, s] of Object.entries(summary.fields)) {
    const reasons =
      Object.entries(s.unknown_by_reason)
        .map(([reason, n]) => `${reason}: ${n}`)
        .join(", ") || "-";
    lines.push(`| ${field} | ${s.known} | ${s.unknown} | ${s.silent} | ${reasons} |`);
  }
  return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const daysIdx = process.argv.indexOf("--days");
  const days = daysIdx > -1 ? Number(process.argv[daysIdx + 1]) : null;
  const since = days ? new Date(Date.now() - days * MS_PER_DAY) : undefined;
  const summary = summarizeFieldCoverage(readTelemetryRows(), { since });
  process.stdout.write(
    `${process.argv.includes("--markdown") ? formatCoverageMarkdown(summary) : JSON.stringify(summary, null, 2)}\n`
  );
}
