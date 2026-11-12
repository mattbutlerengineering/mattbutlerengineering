#!/usr/bin/env node

/**
 * Fails when `metrics/queue-telemetry.jsonl` carries more than one row per
 * (issue, PR).
 *
 * One row per PR is the file's invariant, not a convention: `appendTelemetryRow`
 * in `queue-telemetry-store.mjs` has enforced it on the append path since it
 * was written. Both consumers count rows and treat each as one merged PR —
 * `plugins/acmm/scripts/human-touch-reasons.js` (the 30-day human_touch_reason
 * breakdown) and `scripts/collect-queue-efficiency.mjs` (the queueEfficiency
 * sensor) — so a doubled row inflates numerator and denominator alike.
 *
 * It went wrong anyway, 32 times across #4223, #4572 and #4719, because
 * `reconcile-queue-telemetry.mjs` *rewrites* the sink instead of appending.
 * A rewrite computed in a checkout behind main, landing on a main that has
 * since gained rows, reconciles as "keep both" — five contiguous blocks, each
 * immediately followed by an exact copy of itself. The append-path guard
 * cannot see that; nothing read the file afterwards and noticed.
 *
 * Since #6381 every writer goes through `queue-telemetry-store.mjs`, whose
 * test proves no writer path can produce a duplicate -- but this gate STAYS:
 * `.gitattributes` marks `metrics/*.jsonl` `merge=union`, so two branches that
 * each append the same row merge into two lines with no writer involved. That
 * is a git-level path the store cannot see. The gate now takes its key and path
 * from the store rather than restating them.
 *
 * This is the same shape as the `ciHealth` sensor entries in
 * `.claude/rules/gotchas.md` § CI: a rate whose denominator is not what it
 * claims to be. There the denominator folded in `skipped` runs; here it counts
 * rows while claiming to count PRs.
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs";

import { resolve } from "node:path";

import { runCheck } from "./lib/fitness-check.mjs";
import { telemetryRowKey, telemetryPath } from "./queue-telemetry-store.mjs";

const TELEMETRY_PATH = telemetryPath();

/**
 * The gate, as a pure decision.
 *
 * @param {object[]} rows - parsed telemetry rows, in file order
 * @returns {{ findings: string[] }} One finding per repeated identity; empty means PASS.
 */
export function evaluateTelemetryDuplicates(rows) {
  const linesByKey = new Map();

  rows.forEach((row, index) => {
    const key = telemetryRowKey(row);
    if (key === null) return;
    if (!linesByKey.has(key)) linesByKey.set(key, []);
    linesByKey.get(key).push(index + 1);
  });

  return {
    findings: [...linesByKey.entries()]
      .filter(([, lines]) => lines.length > 1)
      .map(([key, lines]) => {
        const [issue, pr] = key.split("::");
        return `issue #${issue} / PR #${pr} — ${lines.length} rows (lines ${lines.join(", ")})`;
      }),
  };
}

/** Outcome fields a reconcile fills in; a stale unreconciled copy has them all null. */
const OUTCOME_FIELDS = ["merged", "merged_at", "ci_first_pass", "rework_cycles"];

const completeness = (row) => OUTCOME_FIELDS.filter((f) => row[f] != null).length;

/**
 * The `--fix` rule, as a pure function over the file's raw text.
 *
 * For each duplicated (issue, PR) key keep ONE row: the most complete (most
 * non-null among merged, merged_at, ci_first_pass, rework_cycles; ties keep the
 * earliest line), emitted at the position of the key's first occurrence. Every
 * other line — including rows with a null PR, which have no identity to
 * collide on — passes through byte for byte, in order. Idempotent.
 *
 * @param {string} source - raw file contents
 * @returns {{ text: string, changed: boolean, removed: string[] }}
 */
export function collapseTelemetryDuplicates(source) {
  const lines = source.split("\n");
  const trailingNewline = lines[lines.length - 1] === "";
  if (trailingNewline) lines.pop();

  const groups = new Map(); // key -> original indexes
  lines.forEach((raw, index) => {
    if (raw === "") return;
    const key = telemetryRowKey(JSON.parse(raw));
    if (key === null) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });

  const drop = new Set();
  const replace = new Map(); // first-occurrence index -> winning raw line
  const removed = [];
  for (const [key, indexes] of groups) {
    if (indexes.length < 2) continue;
    let winner = indexes[0];
    for (const i of indexes) {
      if (completeness(JSON.parse(lines[i])) > completeness(JSON.parse(lines[winner]))) winner = i;
    }
    const [first] = indexes;
    replace.set(first, lines[winner]);
    const dropped = indexes.filter((i) => i !== winner);
    for (const i of indexes) if (i !== first) drop.add(i);
    const [issue, pr] = key.split("::");
    removed.push(
      `issue #${issue} / PR #${pr} — kept line ${winner + 1} (at line ${first + 1}), dropped line${
        dropped.length > 1 ? "s" : ""
      } ${dropped.map((i) => i + 1).join(", ")}`
    );
  }

  if (removed.length === 0) return { text: source, changed: false, removed };

  const kept = lines.flatMap((raw, i) => (drop.has(i) ? [] : [replace.get(i) ?? raw]));
  return { text: kept.join("\n") + (trailingNewline ? "\n" : ""), changed: true, removed };
}

/**
 * Collapse duplicates in a telemetry file in place. Writes (temp file + rename,
 * so a crash never leaves a torn sink) only when something changed.
 *
 * @param {string} path
 * @returns {{ changed: boolean, removed: string[] }}
 */
export function fixTelemetryFile(path) {
  const result = collapseTelemetryDuplicates(readFileSync(path, "utf-8"));
  if (result.changed) {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, result.text);
    renameSync(tmp, path);
  }
  return { changed: result.changed, removed: result.removed };
}

const FAIL_MESSAGE =
  "FAIL: metrics/queue-telemetry.jsonl has more than one row per (issue, PR).\n" +
  "Both readers count rows and treat each as one merged PR, so a doubled row\n" +
  "inflates numerator and denominator alike (#5630).\n" +
  "Fix: node scripts/check-queue-telemetry-dupes.mjs --fix\n" +
  "keeps the most complete row per (issue, PR) (most non-null of merged,\n" +
  "merged_at, ci_first_pass, rework_cycles; ties keep the earliest line), offline;\n" +
  "commit only metrics/queue-telemetry.jsonl.\n" +
  "Duplicated identities:";

/* c8 ignore start -- thin CLI over the pure function above; exercised via repo-audit */
const isMain = process.argv[1] && process.argv[1].endsWith("check-queue-telemetry-dupes.mjs");

if (isMain) {
  const argv = process.argv.slice(2);
  const rootAt = argv.indexOf("--root");
  const sinkPath =
    rootAt === -1 ? TELEMETRY_PATH : telemetryPath({ root: resolve(argv[rootAt + 1]) });

  if (argv.includes("--fix")) {
    try {
      const { changed, removed } = fixTelemetryFile(sinkPath);
      for (const line of removed) process.stdout.write(`${line}\n`);
      process.stdout.write(
        changed ? `Fixed: ${sinkPath}\n` : "Nothing to fix: no duplicate rows\n"
      );
    } catch (error) {
      if (error.code !== "ENOENT") {
        process.stderr.write(`could not fix ${sinkPath}: ${error.message}\n`);
        process.exit(1);
      }
      process.stdout.write("Nothing to fix: no sink file\n");
    }
  }

  let rows = [];
  try {
    rows = readFileSync(sinkPath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    // An absent sink is the pre-first-run state, not a failure. A malformed
    // one is, and says so rather than passing vacuously.
    if (error.code !== "ENOENT") {
      process.exit(
        runCheck({
          name: "queue telemetry duplicates",
          findings: [`${sinkPath} could not be parsed: ${error.message}`],
          formatFinding: (line) => line,
          failMessage: "FAIL: queue telemetry sink is unreadable.",
        })
      );
    }
  }

  const { findings } = evaluateTelemetryDuplicates(rows);

  process.exit(
    runCheck({
      name: "queue telemetry duplicates",
      findings,
      formatFinding: (line) => line,
      passMessage: `PASS: queue telemetry duplicates (${rows.length} rows, one per issue/PR)`,
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
