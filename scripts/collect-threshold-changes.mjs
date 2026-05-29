#!/usr/bin/env node

/**
 * Threshold-changes collector for ACMM meta-criteria.
 *
 * Scans .github/auto-qa-tuning.json history for threshold adjustments
 * made by the threshold-auto-tuner and appends new entries to
 * metrics/threshold-changes.jsonl.
 *
 * Usage:
 *   node scripts/collect-threshold-changes.mjs              # collect and persist
 *   node scripts/collect-threshold-changes.mjs --dry-run    # print only, no write
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TUNING_PATH = resolve(ROOT, ".github", "auto-qa-tuning.json");
const CHANGES_PATH = resolve(ROOT, "metrics", "threshold-changes.jsonl");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// Pattern: "criterionName: oldVal → newVal (direction, reason)"
const ADJUSTMENT_PATTERN = /^(\S+):\s+([\d.]+)\s+→\s+([\d.]+)\s+\(([^)]+)\)/;

/**
 * Parse threshold change entries from auto-qa-tuning history blocks.
 * Recognises both "threshold-auto-tuner" and "auto-qa-tune" trigger values.
 *
 * Structured format (from threshold-tuner.mjs):
 *   "criterionName: oldVal → newVal (direction, reason)"
 *
 * Free-form format (from auto-qa-tune.mjs):
 *   "Acceptance rate 100% is excellent... Stuck-turns threshold relaxed from 8 to 9 — ..."
 *   → emits a single summary entry per history block.
 */
export function parseThresholdChangesFromHistory(history) {
  const entries = [];

  for (const block of history) {
    if (!block.trigger) continue;
    const isAutoTuner =
      block.trigger === "threshold-auto-tuner" || block.trigger === "auto-qa-tune";
    if (!isAutoTuner) continue;
    if (!Array.isArray(block.adjustments) || block.adjustments.length === 0) continue;

    let structuredCount = 0;

    for (const adj of block.adjustments) {
      const match = ADJUSTMENT_PATTERN.exec(adj.trim());
      if (!match) continue;

      structuredCount++;
      const [, criterion, oldRaw, newRaw, reasonRaw] = match;
      const old_value = parseFloat(oldRaw);
      const new_value = parseFloat(newRaw);

      // reason is everything after the direction token, e.g. "loosen, fp_rate > 30%"
      // The first token before the comma is the direction; the rest is the reason.
      const commaIdx = reasonRaw.indexOf(",");
      const reason = commaIdx >= 0 ? reasonRaw.slice(commaIdx + 1).trim() : reasonRaw.trim();

      entries.push({
        date: block.date,
        criterion,
        old_value,
        new_value,
        reason,
      });
    }

    // Fallback for free-form adjustment strings: emit one summary entry per block
    if (structuredCount === 0) {
      entries.push({
        date: block.date,
        reason: block.adjustments.join("; "),
      });
    }
  }

  return entries;
}

/**
 * Read existing JSONL entries.
 */
function loadExisting(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Remove new entries that are already present in the existing list.
 * Dedup key: date + criterion + old_value + new_value (falling back to date + reason).
 */
export function deduplicateEntries(newEntries, existing) {
  const entryKey = (e) =>
    e.criterion !== undefined
      ? `${e.date}|${e.criterion}|${e.old_value}|${e.new_value}`
      : `${e.date}|${e.reason}`;
  const existingKeys = new Set(existing.map(entryKey));
  return newEntries.filter((e) => !existingKeys.has(entryKey(e)));
}

/**
 * Main collection function. Returns the number of new entries appended.
 */
export function collectThresholdChanges(root, changesPath) {
  const tuningPath = resolve(root, ".github", "auto-qa-tuning.json");
  if (!existsSync(tuningPath)) return 0;

  const config = JSON.parse(readFileSync(tuningPath, "utf-8"));
  const history = config.history ?? [];
  const parsed = parseThresholdChangesFromHistory(history);
  if (parsed.length === 0) return 0;

  const existing = loadExisting(changesPath);
  const fresh = deduplicateEntries(parsed, existing);
  if (fresh.length === 0) return 0;

  mkdirSync(dirname(changesPath), { recursive: true });
  for (const entry of fresh) {
    appendFileSync(changesPath, JSON.stringify(entry) + "\n");
  }

  return fresh.length;
}

/* ── Main ────────────────────────────────────────────── */

function main() {
  const count = collectThresholdChanges(ROOT, CHANGES_PATH);

  if (DRY_RUN) {
    console.log(
      `collect-threshold-changes (dry-run): would append ${count} new entry(ies) to ${CHANGES_PATH}`
    );
    return;
  }

  if (count === 0) {
    console.log("collect-threshold-changes: no new threshold changes found");
  } else {
    console.log(`collect-threshold-changes: appended ${count} entry(ies) to ${CHANGES_PATH}`);
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
