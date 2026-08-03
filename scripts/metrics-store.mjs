#!/usr/bin/env node
/**
 * metrics-store.mjs — the one true seam for learning-loop metrics files.
 *
 * The `metrics/` directory is an implicit interface shared by ~12 scripts
 * (sensors, collectors, tuners, evolvers). Before this module each caller
 * hardcoded the relative path, filename, json-vs-jsonl choice, and
 * missing-file semantics — copied knowledge that already drifted into the
 * #3079 dead sensor, where a reader resolved `docs/metrics/pr-acceptance.json`
 * while the writer used `metrics/pr-acceptance.json`, so the sensor silently
 * degraded to `available: false`.
 *
 * This store owns all of that. Callers name a LOGICAL metric ("pr-acceptance",
 * "queue-telemetry", …); the registry below is the single source of truth for
 * its file, format, and (where present) its weekly rollup. Reader and writer
 * resolve the identical path by construction, so the #3079 class of bug cannot
 * recur — a drift now means a typo'd logical name, which throws loudly instead
 * of degrading silently.
 *
 * Interface (all accept a `root` override so tests never touch the real dir):
 *   read(name)            → parsed JSON | array of parsed JSONL rows | null-on-missing
 *   append(name, entry)   → JSON-array push, or one appended JSONL line, per format
 *   write(name, data)     → overwrite the file (whole-object / whole-array metrics)
 *   readWeekly(name)      → parsed JSON of the weekly rollup | null-on-missing
 *   writeWeekly(name, d)  → overwrite the weekly rollup
 *   resolvePath(name)     → absolute on-disk path (for logs / manual handles)
 *
 * Pure-function / DI style mirrors merge-train-lock.mjs and
 * collect-queue-telemetry.mjs: filesystem access is injectable per call.
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root is one level up from scripts/ — this file's own home defines it,
// so resolution is independent of the caller's cwd.
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const METRICS_DIRNAME = "metrics";

/**
 * Registry: logical metric name → on-disk file + format (+ optional weekly rollup).
 *
 * `format` decides read/append semantics:
 *   "json-array"  — a JSON array; read → parsed array; append → push + rewrite.
 *   "json-object" — a JSON object; read → parsed object; write → overwrite.
 *   "jsonl"       — newline-delimited JSON; read → array of parsed rows;
 *                   append → one appended line.
 * `weekly` — filename of the weekly rollup (always a JSON object) for
 *            readWeekly()/writeWeekly().
 *
 * @type {Record<string, { file: string; format: "json-array"|"json-object"|"jsonl"; weekly?: string }>}
 */
export const METRICS = {
  "pr-acceptance": { file: "pr-acceptance.json", format: "json-array" },
  "ai-issue-feedback": { file: "ai-issue-feedback.json", format: "json-object" },
  "service-health": { file: "service-health.jsonl", format: "jsonl" },
  "process-metrics": {
    file: "process-metrics.jsonl",
    format: "jsonl",
    weekly: "process-metrics-weekly.json",
  },
  "threshold-changes": { file: "threshold-changes.jsonl", format: "jsonl" },
  "instruction-changes": { file: "instruction-changes.jsonl", format: "jsonl" },
  "ai-antipattern-baselines": { file: "ai-antipattern-baselines.json", format: "json-object" },
  "queue-telemetry": { file: "queue-telemetry.jsonl", format: "jsonl" },
  "review-burden": { file: "review-burden.json", format: "json-array" },
  "sensor-report": { file: "sensor-report.json", format: "json-object" },
  "domain-metrics": { file: "domain-metrics.jsonl", format: "jsonl" },
  "a11y-history": { file: "a11y-history.jsonl", format: "jsonl" },
};

// ---------------------------------------------------------------------------
// Registry lookup + path resolution
// ---------------------------------------------------------------------------

/**
 * @param {string} name
 * @returns {{ file: string; format: string; weekly?: string }}
 */
function entryFor(name) {
  const entry = METRICS[name];
  if (!entry) {
    throw new Error(`Unknown metric "${name}" — add it to the metrics-store registry (METRICS).`);
  }
  return entry;
}

/**
 * Absolute path of the one true metrics directory under `root`.
 * @param {string} [root]
 * @returns {string}
 */
export function metricsDir(root = DEFAULT_ROOT) {
  return resolve(root, METRICS_DIRNAME);
}

/**
 * Absolute on-disk path for a metric's primary file.
 * @param {string} name
 * @param {{ root?: string }} [opts]
 * @returns {string}
 */
export function resolvePath(name, { root = DEFAULT_ROOT } = {}) {
  return join(metricsDir(root), entryFor(name).file);
}

/**
 * Absolute on-disk path for a metric's weekly rollup.
 * @param {string} name
 * @param {{ root?: string }} [opts]
 * @returns {string}
 */
export function resolveWeeklyPath(name, { root = DEFAULT_ROOT } = {}) {
  const entry = entryFor(name);
  if (!entry.weekly) {
    throw new Error(`Metric "${name}" has no weekly variant.`);
  }
  return join(metricsDir(root), entry.weekly);
}

// ---------------------------------------------------------------------------
// Default filesystem I/O (injectable)
// ---------------------------------------------------------------------------

/** Reader — returns null when the file does not exist. */
function defaultReadFile(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

/** Writer — creates the parent directory if needed. */
function defaultWriteFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

/** Appender — creates the parent directory if needed. */
function defaultAppendFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, content, "utf-8");
}

/**
 * Parse JSONL content, silently skipping malformed lines.
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
    .filter((v) => v !== null);
}

// ---------------------------------------------------------------------------
// Public read/write API
// ---------------------------------------------------------------------------

/**
 * Read a metric. Missing file → null. JSONL → array of parsed rows; JSON → the
 * parsed value (array or object). Corrupt JSON throws (callers wrap in try/catch
 * where they tolerate it, matching the pre-store behaviour).
 *
 * @param {string} name
 * @param {{ root?: string; readFile?: (p: string) => string|null }} [opts]
 * @returns {unknown|null}
 */
export function read(name, { root = DEFAULT_ROOT, readFile = defaultReadFile } = {}) {
  const entry = entryFor(name);
  const content = readFile(join(metricsDir(root), entry.file));
  if (content == null) return null;
  if (entry.format === "jsonl") return parseJsonl(content);
  return JSON.parse(content);
}

/**
 * Read a metric's weekly rollup. Missing file → null.
 *
 * @param {string} name
 * @param {{ root?: string; readFile?: (p: string) => string|null }} [opts]
 * @returns {unknown|null}
 */
export function readWeekly(name, { root = DEFAULT_ROOT, readFile = defaultReadFile } = {}) {
  const content = readFile(resolveWeeklyPath(name, { root }));
  if (content == null) return null;
  return JSON.parse(content);
}

/**
 * Overwrite a metric file. JSON formats are pretty-printed; a jsonl metric is
 * serialised one row per line.
 *
 * @param {string} name
 * @param {unknown} data
 * @param {{ root?: string; writeFile?: (p: string, c: string) => void }} [opts]
 * @returns {string} the resolved file path
 */
export function write(name, data, { root = DEFAULT_ROOT, writeFile = defaultWriteFile } = {}) {
  const entry = entryFor(name);
  const filePath = join(metricsDir(root), entry.file);
  if (entry.format === "jsonl") {
    const rows = Array.isArray(data) ? data : [];
    const content = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    writeFile(filePath, content);
  } else {
    writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
  }
  return filePath;
}

/**
 * Overwrite a metric's weekly rollup (always a pretty-printed JSON object).
 *
 * @param {string} name
 * @param {unknown} data
 * @param {{ root?: string; writeFile?: (p: string, c: string) => void }} [opts]
 * @returns {string} the resolved weekly file path
 */
export function writeWeekly(
  name,
  data,
  { root = DEFAULT_ROOT, writeFile = defaultWriteFile } = {}
) {
  const filePath = resolveWeeklyPath(name, { root });
  writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
  return filePath;
}

/**
 * Append one entry to a metric. jsonl → appended line; json-array → read the
 * existing array (missing / corrupt / non-array → fresh []), push, rewrite.
 * json-object metrics are whole-file — use write() for those.
 *
 * @param {string} name
 * @param {unknown} entry
 * @param {{
 *   root?: string;
 *   readFile?: (p: string) => string|null;
 *   writeFile?: (p: string, c: string) => void;
 *   appendFile?: (p: string, c: string) => void;
 * }} [opts]
 * @returns {string} the resolved file path
 */
export function append(name, entry, opts = {}) {
  const {
    root = DEFAULT_ROOT,
    readFile = defaultReadFile,
    writeFile = defaultWriteFile,
    appendFile = defaultAppendFile,
  } = opts;
  const meta = entryFor(name);
  const filePath = join(metricsDir(root), meta.file);

  if (meta.format === "jsonl") {
    appendFile(filePath, JSON.stringify(entry) + "\n");
    return filePath;
  }
  if (meta.format === "json-array") {
    let existing = [];
    try {
      const current = read(name, { root, readFile });
      if (Array.isArray(current)) existing = current;
    } catch {
      // Corrupt existing file → start fresh, matching the pre-store writers.
    }
    existing.push(entry);
    writeFile(filePath, JSON.stringify(existing, null, 2) + "\n");
    return filePath;
  }
  throw new Error(
    `Metric "${name}" is a ${meta.format} — use write() to persist it, not append().`
  );
}
