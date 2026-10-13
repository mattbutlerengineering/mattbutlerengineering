#!/usr/bin/env node

/**
 * Collect the queueEfficiency sensor and record one row in
 * metrics/process-metrics.jsonl (#6466).
 *
 * The row used to be written only by the /optimize-implement-queue cloud
 * routine, whose token api.github.com refuses (`credential_rejected`), so the
 * metric went dark. metrics-collectors.yml runs this with a working
 * GITHUB_TOKEN instead. A same-day queueEfficiency row is replaced, not
 * duplicated, so the routine and the workflow can coexist.
 *
 * Usage: node scripts/record-queue-efficiency.mjs [--dry-run]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createGhClient } from "@mbe/gh-client";
import { collectQueueEfficiency, readMergedAiPrsPaged } from "./collect-queue-efficiency.mjs";
import { buildQueueEfficiencyProcessEntry } from "./optimize-implement-queue.mjs";
import { resolvePath } from "./metrics-store.mjs";

/**
 * The 343-PR `pr list` search measured ~20s, over gh-client's 15s default
 * (#6549: `spawnSync gh ETIMEDOUT`). Generous because it is one call.
 */
const LIST_TIMEOUT_MS = 120_000;

/**
 * @param {string} jsonlText existing file contents ("" when absent)
 * @param {{ date: string, sensor: string }} entry
 * @returns {string} new contents with `entry` as the only same-day row for its sensor
 */
export function upsertQueueEfficiencyRow(jsonlText, entry) {
  const kept = jsonlText
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => {
      try {
        const parsed = JSON.parse(line);
        return !(parsed.sensor === entry.sensor && parsed.date === entry.date);
      } catch {
        return true; // never drop a line we cannot parse
      }
    });
  return [...kept, JSON.stringify(entry)].join("\n") + "\n";
}

/**
 * Runs the collector and builds today's row. `readPrs` is injectable for tests.
 * The default reader deliberately lets errors THROW (unlike `defaultReadPrs`,
 * which swallows them to null) so collectQueueEfficiency can classify a
 * 401/rate-limit as credential_rejected/rate_limited, not no_data_in_range.
 */
export function recordQueueEfficiency({
  now = new Date(),
  readPrs = () => readMergedAiPrsPaged(createGhClient({ timeoutMs: LIST_TIMEOUT_MS }), now),
  collect = () => collectQueueEfficiency(readPrs, undefined, now),
} = {}) {
  return buildQueueEfficiencyProcessEntry(now.toISOString().slice(0, 10), collect());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entry = recordQueueEfficiency();
  console.log(JSON.stringify(entry));
  if (!process.argv.includes("--dry-run")) {
    const path = resolvePath("process-metrics");
    const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, upsertQueueEfficiencyRow(existing, entry), "utf-8");
  }
}
