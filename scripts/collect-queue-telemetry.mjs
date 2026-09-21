/**
 * Per-issue queue telemetry writer.
 *
 * Appends one row per worker completion to the queue-telemetry metric.
 * Outcome fields (merged/merged_at/ci_first_pass/rework_cycles) may be null
 * at write time — the sensor reconciles them from GitHub in a later pass.
 *
 * Row schema:
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
 *   human_touch_reason string|undefined  One of HUMAN_TOUCH_REASONS below.
 *                                 Optional — classifies why a merged agent PR
 *                                 needed a human commit. Absent on rows
 *                                 written before this field existed, and on
 *                                 rows where no human touch occurred.
 *
 * Writer is a PURE FUNCTION with dependency injection — no I/O unless
 * the caller passes real readFile/writeFile implementations.
 *
 * Security: only the schema fields above are permitted. Unknown fields
 * (which could carry credentials) cause a throw before any write.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { resolvePath } from "./metrics-store.mjs";

const DEFAULT_TELEMETRY_PATH = resolvePath("queue-telemetry");

/**
 * Fixed taxonomy for why a merged agent PR needed a human touch.
 * Single source of truth — consumed by the classifier, backfill, and
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

/** Permitted schema fields — unknown fields are rejected before any write. */
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
]);

/**
 * Parse JSONL content, silently skipping malformed lines.
 *
 * @param {string} content
 * @returns {unknown[]}
 */
function parseJsonl(content) {
  return content
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
 * Validate that a row object matches the permitted schema.
 * Throws on missing/wrong-type issue_number or any unknown field.
 *
 * @param {unknown} row
 */
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
}

/**
 * Default file reader — returns null when the file does not exist.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function defaultReadFile(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

/**
 * Default file writer — creates parent directory if needed.
 *
 * @param {string} filePath
 * @param {string} content
 */
function defaultWriteFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

/**
 * The identity of a telemetry row: one row per (issue, PR).
 *
 * `appendTelemetryRow` has enforced this on the append path since it was
 * written, so one row per PR is the file's intended invariant — not a
 * convention readers may or may not rely on. Rows with no `pr_number` (the
 * worker failed before opening one) have no identity and are never merged.
 *
 * @param {{issue_number?: number, pr_number?: number|null}} row
 * @returns {string|null} stable key, or null when the row has no identity
 */
export function telemetryRowKey(row) {
  if (row?.pr_number == null) return null;
  return `${row.issue_number}::${row.pr_number}`;
}

/**
 * Collapse rows sharing an identity, keeping the first and folding in any
 * field the later copy carries that the first is missing.
 *
 * The append path cannot produce duplicates, but a *rewrite* can: three
 * `chore(metrics): optimize-implement-queue` commits (#4223, #4572, #4719)
 * put 32 of them in the file, because `reconcile-queue-telemetry.mjs`
 * rewrites the whole sink from the rows its checkout read, and a rewrite
 * landing on a main that has since gained rows reconciles as "keep both".
 * That is why the guard belongs on the write path too, not only the append.
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
    const kept = out[indexByKey.get(key)];
    for (const [field, value] of Object.entries(row)) {
      const missing = !(field in kept) || (kept[field] === null && value !== null);
      if (missing) kept[field] = value;
    }
    removed += 1;
  }

  return { rows: out, removed };
}

/**
 * Append a telemetry row to the queue-telemetry metric sink.
 *
 * Pure function with dependency injection — safe to call from tests
 * without touching the filesystem.
 *
 * Idempotent per (issue_number, pr_number): returns { written: false,
 * reason: "duplicate" } when the same pair already exists.
 *
 * @param {object} row - Telemetry row matching the schema above.
 * @param {object} [opts] - Dependency overrides.
 * @param {string} [opts.filePath] - Path to the JSONL sink.
 * @param {(path: string) => string|null} [opts.readFile] - Reader fn.
 * @param {(path: string, content: string) => void} [opts.writeFile] - Writer fn.
 * @returns {{ written: boolean, reason?: string }}
 */
export function appendTelemetryRow(
  row,
  {
    filePath = DEFAULT_TELEMETRY_PATH,
    readFile = defaultReadFile,
    writeFile = defaultWriteFile,
  } = {}
) {
  validateRow(row);

  const existingContent = readFile(filePath) ?? "";
  const existing = parseJsonl(existingContent);

  // Idempotency: deduplicate by (issue_number, pr_number) when pr_number is set.
  if (row.pr_number != null) {
    const isDuplicate = existing.some(
      (r) => r.issue_number === row.issue_number && r.pr_number === row.pr_number
    );
    if (isDuplicate) {
      return { written: false, reason: "duplicate" };
    }
  }

  // Ensure the existing content ends with a newline before appending.
  const separator = existingContent.length > 0 && !existingContent.endsWith("\n") ? "\n" : "";
  const line = JSON.stringify(row) + "\n";
  writeFile(filePath, existingContent + separator + line);
  return { written: true };
}
