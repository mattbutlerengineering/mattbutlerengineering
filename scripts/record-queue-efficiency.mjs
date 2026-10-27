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

/** @returns {boolean} true when the text holds an available same-day row for the entry's sensor */
function hasAvailableRow(jsonlText, entry) {
  return jsonlText.split("\n").some((line) => {
    try {
      const parsed = JSON.parse(line);
      return (
        parsed.sensor === entry.sensor && parsed.date === entry.date && parsed.available === true
      );
    } catch {
      return false;
    }
  });
}

/**
 * @param {string} jsonlText existing file contents ("" when absent)
 * @param {{ date: string, sensor: string }} entry
 * @returns {string} new contents with `entry` as the only same-day row for its sensor
 */
export function upsertQueueEfficiencyRow(jsonlText, entry) {
  // A failed collection must not erase a good reading already recorded today
  // by another writer (#7581).
  if (entry.available !== true && hasAvailableRow(jsonlText, entry)) return jsonlText;
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

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15_000;

/** A GitHub gateway error or timeout: worth retrying, unlike a rejected credential. */
const TRANSIENT_ERROR = /HTTP 5\d\d|ETIMEDOUT/;

const blockingSleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Re-runs `collect` on a transient 5xx/timeout. The single daily run lost
 * 2026-10-21 and 10-27 to one 504/502 each (#7581).
 */
function collectWithRetry(collect, sleep) {
  let result = collect();
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    const transient =
      result.available !== true &&
      result.reason === "query_error" &&
      TRANSIENT_ERROR.test(String(result.error ?? ""));
    if (!transient) break;
    sleep(RETRY_DELAY_MS * attempt);
    result = collect();
  }
  return result;
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
  sleep = blockingSleep,
} = {}) {
  return buildQueueEfficiencyProcessEntry(
    now.toISOString().slice(0, 10),
    collectWithRetry(collect, sleep)
  );
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
