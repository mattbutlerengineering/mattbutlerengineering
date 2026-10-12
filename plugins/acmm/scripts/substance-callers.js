import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Caller check for criteria whose detection is an existence check on an artifact (#5880).
 *
 * A file's presence proves nothing about whether anything uses it: `.github/policies/`,
 * `.claude/risk-config.json`, `scripts/orchestrate.mjs` and `.github/prompts/` each satisfied an
 * upstream criterion for months with no reader. The artifact only counts when something that
 * actually runs or loads it (a workflow, script, hook, skill or agent) references its path.
 *
 * Deliberately not callers: markdown outside `.claude/` (prose that describes the artifact is the
 * exact false signal this replaces), tests (a test of the artifact is not a use of it), the
 * artifact's own files, and `plugins/acmm` (the scorer names every path it looks for).
 */

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "generated",
  "worktrees",
  "docs",
  "__tests__",
  ".turbo",
  ".next",
  // .claude corpora that record history rather than run anything
  "memory",
  "reflections",
  "improvement-loop",
  "acmm",
]);
const CODE_EXT = /\.(?:[cm]?[jt]sx?|sh|ya?ml)$/;
const CLAUDE_EXT = /\.(?:[cm]?[jt]sx?|sh|ya?ml|json|md)$/;
const TEST_FILE = /\.(?:test|spec)\./;
const MAX_BYTES = 1024 * 1024;

function toRel(cwd, full) {
  return relative(cwd, full).split(sep).join("/");
}

function* walk(dir, cwd, excluded) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = toRel(cwd, full);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || rel === "plugins/acmm") continue;
      yield* walk(full, cwd, excluded);
    } else if (entry.isFile()) {
      if (excluded.has(full) || TEST_FILE.test(entry.name) || entry.name === "pnpm-lock.yaml") {
        continue;
      }
      const ext = rel.startsWith(".claude/") ? CLAUDE_EXT : CODE_EXT;
      if (ext.test(entry.name)) yield full;
    }
  }
}

function findCaller(cwd, needles, artifactFiles) {
  const excluded = new Set(artifactFiles);
  for (const file of walk(cwd, cwd, excluded)) {
    try {
      if (statSync(file).size > MAX_BYTES) continue;
      const content = readFileSync(file, "utf-8");
      const needle = needles.find((n) => content.includes(n));
      if (needle) return { file: toRel(cwd, file), needle };
    } catch {
      // an unreadable file cannot be a caller
    }
  }
  return null;
}

/** Build a substance checker that passes only when something runs or loads the artifact. */
export function callerChecker(needles) {
  return (filePaths, cwd) => {
    const hit = findCaller(cwd, needles, filePaths);
    if (hit) return { passed: true, evidence: `referenced by ${hit.file} (${hit.needle})` };
    return {
      passed: false,
      evidence: `no workflow, script, hook, skill or agent references ${needles.join(" / ")}`,
    };
  };
}
