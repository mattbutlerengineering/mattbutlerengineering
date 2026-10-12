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
 * (`collect-queue-telemetry.mjs`), the GitHub backstop
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
 * Writer rows are schema-checked: unknown fields (which could carry
 * credentials) throw before any write.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
}

function parseRows(content) {
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

function defaultReadFile(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
}

function defaultWriteFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Append a telemetry row. Idempotent per (issue_number, pr_number): returns
 * `{ written: false, reason: "duplicate" }` when the identity already exists.
 *
 * With `ifPrAbsent` the row is a placeholder (the GitHub backstop's) and is
 * refused when ANY row covers its PR, even under another issue.
 *
 * Dependency-injected so tests need no filesystem: `filePath`/`readFile`/
 * `writeFile` override the I/O; `root` redirects the metrics directory.
 *
 * @param {object} row - Telemetry row matching the schema in
 *   `collect-queue-telemetry.mjs`.
 * @param {object} [opts]
 * @param {string} [opts.root]
 * @param {string} [opts.filePath] - Overrides the resolved sink path.
 * @param {(path: string) => string|null} [opts.readFile]
 * @param {(path: string, content: string) => void} [opts.writeFile]
 * @param {boolean} [opts.ifPrAbsent]
 * @returns {{ written: boolean, reason?: string }}
 */
export function appendTelemetryRow(
  row,
  {
    root,
    filePath = telemetryPath({ root }),
    readFile = defaultReadFile,
    writeFile = defaultWriteFile,
    ifPrAbsent = false,
  } = {}
) {
  validateRow(row);

  const existingContent = readFile(filePath) ?? "";
  const existing = parseRows(existingContent);
  const key = telemetryRowKey(row);

  const duplicate =
    key !== null &&
    (ifPrAbsent
      ? coveredPrNumbers(existing).has(row.pr_number)
      : existing.some((r) => telemetryRowKey(r) === key));
  if (duplicate) return { written: false, reason: "duplicate" };

  const separator = existingContent.length > 0 && !existingContent.endsWith("\n") ? "\n" : "";
  writeFile(filePath, existingContent + separator + JSON.stringify(row) + "\n");
  return { written: true };
}
