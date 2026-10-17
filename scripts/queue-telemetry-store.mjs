/**
 * Queue-telemetry store -- the one module that owns `metrics/queue-telemetry.jsonl`.
 *
 * It owns three things the sink's five scripts used to restate separately:
 *
 *   1. The row KEY. One row per (issue, PR); a row with no PR has no identity.
 *   2. The MERGE. Duplicates fold into the first copy, never silently dropped.
 *   3. The PATH. Always `metrics-store.resolvePath`, never a literal.
 *
 * Every writer goes through here: the in-session append
 * (`appendTelemetryRow` below), the GitHub backstop
 * (`collect-queue-telemetry-from-github.mjs`), and the rewrite paths
 * (`reconcile-queue-telemetry.mjs`, `backfill-human-touch-reasons.mjs`). The
 * rewrite path is `updateTelemetry`: it reads the sink, applies a transform,
 * re-collapses on the key and writes -- so a rewrite can no longer land
 * duplicates the way #4223, #4572 and #4719 did (32 rows).
 *
 * What the store CANNOT prevent: `.gitattributes` marks `metrics/*.jsonl`
 * `merge=union`, so two branches that each append the same row merge into two
 * lines with no writer involved. That is why `check-queue-telemetry-dupes.mjs`
 * stays as the gate -- it now reads the sink and the key through this module.
 *
 * Why (issue, PR) and not PR alone: the sink holds a PR that legitimately
 * closed two issues (#5639 -> #5604, #5608), one row each. The GitHub backstop
 * recovers only the first closing issue from a PR body, so it can pick a
 * different issue than the in-session writer claimed; it therefore appends with
 * `ifPrAbsent`, which refuses a placeholder row when ANY row covers that PR.
 *
 * Row schema (outcome fields -- merged/merged_at/ci_first_pass/rework_cycles --
 * may be null at write time; the sensor reconciles them from GitHub later):
 *   issue_number    number        GitHub issue number
 *   labels          string[]      Labels at time of claim
 *   model_tier      string        haiku | sonnet | opus
 *   subagent_tokens number        Tokens from worker <usage> payload
 *   tool_uses       number        Tool call count for the session
 *   duration_ms     number        Wall-clock ms from claim to completion
 *   pr_number       number|null   PR created (null if worker failed)
 *   merged          boolean|null  Reconciled by sensor
 *   ci_first_pass   boolean|null  Reconciled by sensor
 *   rework_cycles   number|null   Reconciled by sensor
 *   reviewer_verdict string|null  pass | flag | skipped | error
 *                                 error = the reviewer could not run (dispatch
 *                                 threw / timed out). Distinct from pass: the
 *                                 merge gate never fired. Read by
 *                                 collect-queue-efficiency's review_coverage.
 *   claimed_at      string        ISO 8601
 *   merged_at       string|null   ISO 8601, reconciled by sensor
 *   cost_usd        number|null   Optional precise cost if known at write time
 *   human_touch_reason string|undefined  One of HUMAN_TOUCH_REASONS.
 *                                 Optional — classifies why a merged agent PR
 *                                 needed a human commit. Absent on rows
 *                                 written before this field existed, and on
 *                                 rows where no human touch occurred.
 *   unknown_reasons object|undefined  { [field]: reason } for a reconcilable
 *                                 field (merged, merged_at, ci_first_pass,
 *                                 reviewer_verdict, cost_usd, model_tier) that
 *                                 is null. Reason is one of
 *                                 TELEMETRY_UNKNOWN_REASONS. The field itself
 *                                 stays null -- never the string "unknown".
 *
 * Writer rows are schema-checked: unknown fields (which could carry
 * credentials) throw before any write.
 */

import { read, write, resolvePath } from "./metrics-store.mjs";

/**
 * Fixed taxonomy for why a merged agent PR needed a human touch.
 * Single source of truth -- consumed by the classifier, backfill, and
 * ACMM report (parts 2-4 of #3805/#3806).
 */
export const HUMAN_TOUCH_REASONS = Object.freeze([
  "review-fix",
  "ci-failure",
  "merge-conflict",
  "lint-fixup",
  "generated-artifact-regen",
  "ci-rerun",
  "scope-change",
  "reviewer-flagged-rework",
  "other",
]);

/**
 * Why a reconcilable field is still null: separates "not reconciled yet" or
 * "can't be known" from a silent gap.
 */
export const TELEMETRY_UNKNOWN_REASONS = Object.freeze([
  "no-pr",
  "no-claimed-at",
  "pr-open",
  "pr-not-found",
  "no-ci-gate-run",
  "no-verdict-comment",
  "no-ledger-row",
  "unmapped-model",
  "source-error",
]);

/** Fields the reconciler fills; the only valid `unknown_reasons` keys. */
export const RECONCILABLE_FIELDS = Object.freeze([
  "merged",
  "merged_at",
  "ci_first_pass",
  "reviewer_verdict",
  "cost_usd",
  "model_tier",
]);

/** Permitted schema fields -- unknown fields are rejected before any write. */
const SAFE_FIELDS = new Set([
  "issue_number",
  "labels",
  "model_tier",
  "subagent_tokens",
  "tool_uses",
  "duration_ms",
  "pr_number",
  "merged",
  "ci_first_pass",
  "rework_cycles",
  "reviewer_verdict",
  "claimed_at",
  "merged_at",
  "cost_usd",
  "human_touch_reason",
  "unknown_reasons",
]);

// ---------------------------------------------------------------------------
// Path + read
// ---------------------------------------------------------------------------

/**
 * Absolute path of the sink, resolved by metrics-store.
 *
 * @param {{ root?: string }} [opts]
 * @returns {string}
 */
export function telemetryPath({ root } = {}) {
  return resolvePath("queue-telemetry", root === undefined ? {} : { root });
}

/**
 * Every parsed row, in file order. An absent sink is an empty list.
 *
 * @param {{ root?: string, readFile?: (p: string) => string|null }} [opts]
 * @returns {object[]}
 */
export function readTelemetryRows(opts = {}) {
  return read("queue-telemetry", opts) ?? [];
}

// ---------------------------------------------------------------------------
// Identity + merge
// ---------------------------------------------------------------------------

/**
 * The identity of a telemetry row: one row per (issue, PR). Rows with no
 * `pr_number` (the worker failed before opening one) have no identity and are
 * never merged.
 *
 * @param {{issue_number?: number, pr_number?: number|null}} row
 * @returns {string|null} stable key, or null when the row has no identity
 */
export function telemetryRowKey(row) {
  if (row?.pr_number == null) return null;
  return `${row.issue_number}::${row.pr_number}`;
}

/**
 * PR numbers that have at least one row, whatever issue it names.
 *
 * @param {object[]} rows
 * @returns {Set<number>}
 */
export function coveredPrNumbers(rows) {
  return new Set(rows.map((r) => r?.pr_number).filter((n) => n != null));
}

/**
 * Collapse rows sharing an identity, keeping the first and folding in any
 * field the later copy carries that the first is missing. Pure: input rows are
 * never mutated.
 *
 * Merging rather than dropping matters: of the 32 real duplicates, 30 pairs
 * were byte-identical and 2 carried a `human_touch_reason` only on the later
 * copy. Dropping blind would have silently discarded those two values.
 *
 * @param {object[]} rows
 * @returns {{ rows: object[], removed: number }}
 */
export function dedupeTelemetryRows(rows) {
  const indexByKey = new Map();
  const out = [];
  let removed = 0;

  for (const row of rows) {
    const key = telemetryRowKey(row);
    if (key === null || !indexByKey.has(key)) {
      if (key !== null) indexByKey.set(key, out.length);
      out.push(row);
      continue;
    }
    const at = indexByKey.get(key);
    const kept = { ...out[at] };
    for (const [field, value] of Object.entries(row)) {
      const missing = !(field in kept) || (kept[field] === null && value !== null);
      if (missing) kept[field] = value;
    }
    out[at] = kept;
    removed += 1;
  }

  return { rows: out, removed };
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/**
 * Rewrite the sink through a transform. Reads the current rows, lets `fn`
 * return the new set, collapses it on the row key, and writes only when the
 * result differs from what was read.
 *
 * @param {(rows: object[]) => { rows: object[] } & Record<string, unknown>} fn -
 *   Receives the current rows; returns `{ rows, ...anything }`. Extra fields
 *   come back to the caller as `result`.
 * @param {{ root?: string, readFile?: (p: string) => string|null, writeFile?: (p: string, c: string) => void }} [opts]
 * @returns {{ written: boolean, removed: number, rows: object[], result: object }}
 */
export function updateTelemetry(fn, opts = {}) {
  const current = readTelemetryRows(opts);
  const { rows: next, ...result } = fn(current);
  const { rows, removed } = dedupeTelemetryRows(next);
  const written = JSON.stringify(rows) !== JSON.stringify(current);
  if (written) write("queue-telemetry", rows, opts);
  return { written, removed, rows, result };
}

function validateRow(row) {
  if (typeof row !== "object" || row === null) {
    throw new Error("row must be a non-null object");
  }
  if (typeof row.issue_number !== "number") {
    throw new Error("issue_number must be a number");
  }
  for (const key of Object.keys(row)) {
    if (!SAFE_FIELDS.has(key)) {
      throw new Error(`unknown field: ${key} — only schema fields are permitted`);
    }
  }
  if (
    row.human_touch_reason !== undefined &&
    !HUMAN_TOUCH_REASONS.includes(row.human_touch_reason)
  ) {
    throw new Error(
      `human_touch_reason must be one of ${HUMAN_TOUCH_REASONS.join(", ")}, got: ${row.human_touch_reason}`
    );
  }
  if (row.unknown_reasons !== undefined) {
    const reasons = row.unknown_reasons;
    if (typeof reasons !== "object" || reasons === null || Array.isArray(reasons)) {
      throw new Error("unknown_reasons must be an object of { field: reason }");
    }
    for (const [field, reason] of Object.entries(reasons)) {
      if (!RECONCILABLE_FIELDS.includes(field)) {
        throw new Error(
          `unknown_reasons key must be one of ${RECONCILABLE_FIELDS.join(", ")}, got: ${field}`
        );
      }
      if (!TELEMETRY_UNKNOWN_REASONS.includes(reason)) {
        throw new Error(
          `unknown_reasons.${field} must be one of ${TELEMETRY_UNKNOWN_REASONS.join(", ")}, got: ${reason}`
        );
      }
    }
  }
}

/**
 * Append a telemetry row. Idempotent per (issue_number, pr_number): returns
 * `{ written: false, reason: "duplicate" }` when the identity already exists.
 *
 * With `ifPrAbsent` the row is a placeholder (the GitHub backstop's) and is
 * refused when ANY row covers its PR, even under another issue.
 *
 * Dependency-injected so tests need no filesystem: `readFile`/`writeFile`
 * override the I/O (the same `metrics-store` path `readTelemetryRows` and
 * `updateTelemetry` use); `root` redirects the metrics directory.
 *
 * @param {object} row - Telemetry row matching the schema in the header.
 * @param {object} [opts]
 * @param {string} [opts.root]
 * @param {(path: string) => string|null} [opts.readFile]
 * @param {(path: string, content: string) => void} [opts.writeFile]
 * @param {boolean} [opts.ifPrAbsent]
 * @returns {{ written: boolean, reason?: string }}
 */
export function appendTelemetryRow(row, { ifPrAbsent = false, ...io } = {}) {
  validateRow(row);

  const existing = readTelemetryRows(io);
  const key = telemetryRowKey(row);

  const duplicate =
    key !== null &&
    (ifPrAbsent
      ? coveredPrNumbers(existing).has(row.pr_number)
      : existing.some((r) => telemetryRowKey(r) === key));
  if (duplicate) return { written: false, reason: "duplicate" };

  write("queue-telemetry", [...existing, row], io);
  return { written: true };
}
