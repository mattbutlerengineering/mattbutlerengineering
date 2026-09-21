#!/usr/bin/env node

/**
 * Fails when `metrics/queue-telemetry.jsonl` carries more than one row per
 * (issue, PR).
 *
 * One row per PR is the file's invariant, not a convention: `appendTelemetryRow`
 * in `collect-queue-telemetry.mjs` has enforced it on the append path since it
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
 * This is the same shape as the `ciHealth` sensor entries in
 * `.claude/rules/gotchas.md` § CI: a rate whose denominator is not what it
 * claims to be. There the denominator folded in `skipped` runs; here it counts
 * rows while claiming to count PRs.
 */

import { readFileSync } from "node:fs";

import { runCheck } from "./lib/fitness-check.mjs";
import { telemetryRowKey } from "./collect-queue-telemetry.mjs";

const TELEMETRY_PATH = "metrics/queue-telemetry.jsonl";

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

export const FAIL_MESSAGE =
  "FAIL: metrics/queue-telemetry.jsonl has more than one row per (issue, PR).\n" +
  "Both readers count rows and treat each as one merged PR, so a doubled row\n" +
  "inflates numerator and denominator alike (#5630).\n" +
  "Fix: `node scripts/reconcile-queue-telemetry.mjs` collapses duplicates on\n" +
  "write; commit only metrics/queue-telemetry.jsonl.\n" +
  "Duplicated identities:";

/* c8 ignore start -- thin CLI over the pure function above; exercised via repo-audit */
const isMain = process.argv[1] && process.argv[1].endsWith("check-queue-telemetry-dupes.mjs");

if (isMain) {
  let rows = [];
  try {
    rows = readFileSync(TELEMETRY_PATH, "utf-8")
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
          findings: [`${TELEMETRY_PATH} could not be parsed: ${error.message}`],
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
