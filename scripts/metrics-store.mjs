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
 *   lastEntry(name)       → the final JSONL row | null-on-missing (history tail)
 *   append(name, entry)   → JSON-array push, or one appended JSONL line, per format
 *   write(name, data)     → overwrite the file (whole-object / whole-array metrics)
 *   readWeekly(name)      → parsed JSON of the weekly rollup | null-on-missing
 *   writeWeekly(name, d)  → overwrite the weekly rollup
 *   resolvePath(name)     → absolute on-disk path (for logs / manual handles)
 *
 * The store also owns **durability** (#3645). Scheduled routines run in
 * ephemeral checkouts, so a metric that is not git-tracked reads back empty on
 * every cloud run — which is how the learning loop's self-tuner spent months
 * reporting "No verification data". Durability used to be declared in four
 * places that disagreed (this registry, two separate .gitignore blocks, and a
 * routine prompt). It is now one property here — `durable: true` — with the
 * .gitignore negations rendered from it and drift asserted in
 * scripts/__tests__/durable-manifest.test.mjs.
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
 * `durable` — the metric must survive an ephemeral checkout, so it is
 *            git-tracked. Drives the generated .gitignore block below.
 *
 * @type {Record<string, { file: string; format: "json-array"|"json-object"|"jsonl"; weekly?: string; durable?: boolean }>}
 */
export const METRICS = {
  "pr-acceptance": { file: "pr-acceptance.json", format: "json-array", durable: true },
  "ai-issue-feedback": { file: "ai-issue-feedback.json", format: "json-object", durable: true },
  "service-health": { file: "service-health.jsonl", format: "jsonl", durable: true },
  "process-metrics": {
    file: "process-metrics.jsonl",
    format: "jsonl",
    weekly: "process-metrics-weekly.json",
    durable: true,
  },
  "threshold-changes": { file: "threshold-changes.jsonl", format: "jsonl", durable: true },
  "instruction-changes": { file: "instruction-changes.jsonl", format: "jsonl", durable: true },
  "ai-antipattern-baselines": {
    file: "ai-antipattern-baselines.json",
    format: "json-object",
    durable: true,
  },
  "queue-telemetry": { file: "queue-telemetry.jsonl", format: "jsonl", durable: true },
  "review-burden": { file: "review-burden.json", format: "json-array", durable: true },
  // Latest-only snapshot, deliberately NOT durable: a 5 KB whole-file rewrite
  // in a merge=union directory is a conflict magnet and carries no trend. The
  // history the tuner actually reads backwards is sensor-report-history.
  "sensor-report": { file: "sensor-report.json", format: "json-object" },
  "domain-metrics": { file: "domain-metrics.jsonl", format: "jsonl", durable: true },
  "sensor-report-history": { file: "sensor-report.jsonl", format: "jsonl", durable: true },
  "a11y-history": { file: "a11y-history.jsonl", format: "jsonl", durable: true },
  verifications: { file: "verifications.jsonl", format: "jsonl", durable: true },
  // Written by the weekly stale detector *before* it labels anything: the
  // label write bumps `updated_at`, destroying the staleness it measured
  // (#4274). Durable — the detector runs in an ephemeral checkout.
  "stale-human-blocked": { file: "stale-human-blocked.jsonl", format: "jsonl", durable: true },
};

/**
 * Durable artifacts that live outside `metrics/`. Each entry states why it
 * must survive an ephemeral checkout.
 *
 * @type {Record<string, string>}
 */
export const DURABLE_OUTSIDE = {
  ".claude/improvement-loop/log.md": "human-readable loop audit narrative, merge=union",
  ".claude/improvement-loop/revert-log.md": "written by .github/workflows/revert-rca-detection.yml",
  "apps/marketing/public/sensor-report.json":
    "public AI-health page copy, written by scripts/sensor-report.mjs",
};

/**
 * Files inside `metrics/` written by another tree, so they have no entry in
 * METRICS. Each entry names its owner.
 *
 * @type {Record<string, string>}
 */
export const EXTERNAL = {
  "acmm-evals.jsonl": "plugins/acmm/scripts/evals.js",
  "agent-perf.jsonl": "tools/cli/src/commands/stats.ts",
  "eval-reports.jsonl": "tools/cli/src/commands/agent-eval.ts",
  "last-audit.json": "tools/cli/src/commands/stats.ts",
  "production-health/": ".github/workflows/production-feedback.yml",
};

/**
 * Directories whose contents git ignores wholesale. A durable path under one
 * of these needs an explicit `!` negation to be trackable at all; a durable
 * path outside them (apps/marketing/public/sensor-report.json) is tracked by
 * default and must NOT appear in the generated block — negating a path in a
 * directory that was never ignored would be harmless, but ignoring its parent
 * to make the negation meaningful would drop real source files.
 */
export const IGNORED_ROOTS = [".claude/improvement-loop/", METRICS_DIRNAME + "/"];

/** Delimiters for the generated .gitignore block. */
export const GITIGNORE_BEGIN =
  "# >>> BEGIN generated durable-metrics block — scripts/metrics-store.mjs";
export const GITIGNORE_END = "# <<< END generated durable-metrics block";

/**
 * Every path that must survive an ephemeral checkout, repo-relative and
 * sorted. Directory entries keep their trailing slash.
 *
 * @returns {string[]}
 */
export function durableManifest() {
  return [
    ...Object.values(METRICS)
      .filter((m) => m.durable)
      .map((m) => `${METRICS_DIRNAME}/${m.file}`),
    ...Object.keys(DURABLE_OUTSIDE),
    ...Object.keys(EXTERNAL).map((file) => `${METRICS_DIRNAME}/${file}`),
  ].sort();
}

/**
 * Render the .gitignore block from the manifest: for each wholesale-ignored
 * root, the `/<root>*` ignore followed by one `!` negation per durable path
 * inside it. Directory entries get a second `!<dir>*` line so git re-includes
 * the dynamically-named files within.
 *
 * @param {string[]} [paths]
 * @returns {string}
 */
export function renderDurableGitignoreBlock(paths = durableManifest()) {
  const lines = [
    GITIGNORE_BEGIN,
    "# Do not edit by hand — run `node scripts/metrics-store.mjs --sync-gitignore`.",
    "# Every path below is durable: scheduled routines run in ephemeral checkouts,",
    "# so an untracked append is lost with the checkout. Append-only churn is",
    "# handled by merge=union in .gitattributes.",
  ];

  for (const root of IGNORED_ROOTS) {
    const inRoot = paths.filter((p) => p.startsWith(root));
    if (inRoot.length === 0) continue;
    // Ignore the *contents*, not the directory itself — git will not descend
    // into a directory ignored as a whole, which would make the negations dead.
    lines.push(`/${root}*`);
    for (const path of inRoot) {
      lines.push(`!/${path}`);
      if (path.endsWith("/")) lines.push(`!/${path}*`);
    }
  }

  lines.push(GITIGNORE_END);
  return lines.join("\n");
}

/**
 * Extract the generated block from .gitignore contents. Returns null when the
 * markers are absent or malformed.
 *
 * @param {string} content
 * @returns {string|null}
 */
export function extractDurableGitignoreBlock(content) {
  const start = content.indexOf(GITIGNORE_BEGIN);
  const end = content.indexOf(GITIGNORE_END);
  if (start === -1 || end === -1 || end < start) return null;
  return content.slice(start, end + GITIGNORE_END.length);
}

/**
 * Replace the generated block in .gitignore contents with a freshly rendered
 * one. Throws when the markers are missing rather than guessing where the
 * block belongs — placement is a human decision, ordering matters in gitignore.
 *
 * @param {string} content
 * @param {string} [block]
 * @returns {string}
 */
export function applyDurableGitignoreBlock(content, block = renderDurableGitignoreBlock()) {
  const existing = extractDurableGitignoreBlock(content);
  if (existing === null) {
    throw new Error(
      `.gitignore is missing the generated durable-metrics markers (${GITIGNORE_BEGIN} … ${GITIGNORE_END}).`
    );
  }
  return content.replace(existing, block);
}

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
 * Read the final row of a jsonl metric — the "previous run" a history-based
 * comparison needs, without the caller reasoning about file layout. Missing or
 * empty file → null.
 *
 * @param {string} name
 * @param {{ root?: string; readFile?: (p: string) => string|null }} [opts]
 * @returns {unknown|null}
 */
export function lastEntry(name, opts = {}) {
  const meta = entryFor(name);
  if (meta.format !== "jsonl") {
    throw new Error(`Metric "${name}" is a ${meta.format} — lastEntry() only reads jsonl history.`);
  }
  const rows = read(name, opts);
  return Array.isArray(rows) && rows.length > 0 ? rows[rows.length - 1] : null;
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

// ---------------------------------------------------------------------------
// CLI — regenerate the derived .gitignore block
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--sync-gitignore")) {
    process.stderr.write("Usage: node scripts/metrics-store.mjs --sync-gitignore\n");
    process.exit(1);
  }
  const gitignorePath = join(DEFAULT_ROOT, ".gitignore");
  const current = readFileSync(gitignorePath, "utf-8");
  const next = applyDurableGitignoreBlock(current);
  if (next === current) {
    process.stdout.write("[metrics-store] .gitignore durable block already up to date\n");
  } else {
    writeFileSync(gitignorePath, next, "utf-8");
    process.stdout.write("[metrics-store] Regenerated the .gitignore durable block\n");
  }
}
