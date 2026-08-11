#!/usr/bin/env node
/**
 * issue-zone.mjs — estimate an issue's merge-train zone and compose a
 * breadth-first (zone-spread) claim batch for the implement-queue.
 *
 * WHY THIS EXISTS — the N² branch-update tax (see ADR-023):
 * `main` is `strict` (ADR-016: a branch must be up-to-date before it merges).
 * The merge train holds a **per-zone** lock (`scripts/merge-train-lock.mjs`).
 * Stacking multiple same-zone PRs therefore serializes: each merge makes the
 * siblings out-of-date, forcing `gh pr update-branch` + a full CI re-run per
 * sibling. Claiming a batch that spreads across **distinct** zones lets those
 * PRs merge without invalidating one another.
 *
 * This module never invents a second zone list. It derives the `<root>/<name>`
 * vocabulary straight from merge-train-lock (`WORKSPACE_ROOTS` + `zoneForPath`),
 * so the estimate and the lock always agree.
 *
 * Public API:
 *   issueZone(issue)                         → string | null   (estimated zone)
 *   selectZoneSpreadBatch(candidates, opts)  → issue[]         (spread batch)
 *   SCOPE_ZONE_MAP                           → Map<scope, zone> (scope → zone)
 *   buildScopeZoneMap(repoRoot?)             → Map<scope, zone> (rescan helper)
 *
 * @module issue-zone
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORKSPACE_ROOTS, zoneForPath, zoneForPaths } from "./merge-train-lock.mjs";

// Repo root resolved from this module's own location (scripts/ → repo root),
// so the workspace scan is independent of the caller's cwd.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Default parallel-worker ceiling — mirrors MAX_CONCURRENT_WORKERS in
// scripts/worker-dispatch.mjs and the "claim up to 3" batch in the skill.
const DEFAULT_MAX_WORKERS = 3;

// ---------------------------------------------------------------------------
// Scope → zone map
// ---------------------------------------------------------------------------

/**
 * Builds the scope→zone map by scanning the merge-train workspace roots.
 *
 * The conventional-commit scope is, by repo convention, the workspace package
 * directory name (`packages/rialto` → scope `rialto`). Scanning the real dirs
 * keeps the map from drifting out of a hand-maintained list, and each zone
 * string is produced by `zoneForPath` so the format is identical to the lock's.
 *
 * On a scope collision across roots, the earliest root in `WORKSPACE_ROOTS`
 * wins (deterministic; there are currently no cross-root basename collisions).
 *
 * @param {string} [repoRoot] — repo root to scan (default: resolved from module)
 * @returns {Map<string, string>} scope → `<root>/<name>` zone
 */
function buildScopeZoneMap(repoRoot = REPO_ROOT) {
  const map = new Map();
  for (const root of WORKSPACE_ROOTS) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(repoRoot, root), { withFileTypes: true });
    } catch {
      continue; // a root may be absent in some checkouts
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const scope = entry.name;
      if (map.has(scope)) continue; // first (highest-precedence) root wins
      // Reuse merge-train-lock's path→zone formatting → guaranteed vocabulary.
      map.set(scope, zoneForPath(`${root}/${scope}/package.json`));
    }
  }
  return map;
}

/**
 * The scope→zone map for this repo, built once at module load.
 * @type {Map<string, string>}
 */
const SCOPE_ZONE_MAP = buildScopeZoneMap();

/**
 * Aliases for conventional-commit scopes that are common in this repo's
 * titles (#4079) but aren't literal workspace-package directory names, so
 * `buildScopeZoneMap`'s directory scan can never discover them on its own.
 * Each value is a REPRESENTATIVE PATH, not a hand-typed zone string — the
 * zone is always derived by running that path through merge-train-lock's own
 * `zoneForPath`, so this can never drift into a second, divergent zone
 * vocabulary (see module docstring).
 *
 * Deliberately narrow: only the scopes #4079's acceptance criteria name.
 * A scope like `skills` stays unmapped (→ null) on purpose — it's genuinely
 * cross-cutting (`.claude/skills/**` covers every skill), not one zone.
 *
 * @type {Record<string, string>}
 */
const EXTRA_SCOPE_PATHS = {
  ci: ".github/workflows/ci.yml",
  automation: ".github/workflows/drift-fix.yml",
  deps: "package.json",
  "implement-queue": "packages/agent-core/package.json",
};

/**
 * Builds the alias scope→zone map from `EXTRA_SCOPE_PATHS`, reusing
 * merge-train-lock's `zoneForPath` for every value.
 * @returns {Map<string, string>}
 */
function buildExtraScopeZoneMap() {
  const map = new Map();
  for (const [scope, examplePath] of Object.entries(EXTRA_SCOPE_PATHS)) {
    map.set(scope, zoneForPath(examplePath));
  }
  return map;
}

/**
 * @type {Map<string, string>}
 */
const EXTRA_SCOPE_ZONE_MAP = buildExtraScopeZoneMap();

// ---------------------------------------------------------------------------
// Body-derived path fallback
// ---------------------------------------------------------------------------

// The `/decompose` output shape (see .claude/skills/decompose) always emits
// this exact heading before its file list.
const FILES_SECTION_HEADING = /^#{1,6}[ \t]*files to modify\/create[ \t]*$/im;
// Any markdown heading — used to find where the files section ends.
const HEADING_LINE = /^#{1,6}[ \t]+\S/m;

// Repo-root directory entries that are never a candidate "root-level path"
// segment: the workspace roots themselves (already matched by the pattern
// below, via a *different* zone) and VCS/dependency internals.
const ROOT_DIR_EXCLUDE = new Set([...WORKSPACE_ROOTS, "node_modules", ".git"]);

/**
 * Scans the repo root for real top-level directories that are NOT one of
 * the merge-train workspace roots (apps/packages/services) — e.g. `scripts/`,
 * `docs/`, `.claude/`. Every one of these already maps to the `root` zone
 * via merge-train-lock's `zoneForPath`; listing them here only widens what
 * `extractPathsFromBody` recognizes as a path token at all — it never
 * changes what zone a recognized path resolves to.
 *
 * Disk-derived (mirrors `buildScopeZoneMap`'s approach) so this list can't
 * drift from the real repo layout — the drift pattern already fixed 3x
 * (#3887, #3916, #3933): two hand-maintained lists that must agree.
 *
 * @param {string} [repoRoot]
 * @returns {string[]}
 */
function buildRootDirList(repoRoot = REPO_ROOT) {
  let entries;
  try {
    entries = fs.readdirSync(repoRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !ROOT_DIR_EXCLUDE.has(entry.name))
    .map((entry) => entry.name);
}

// Common top-level filenames referenced in issue bodies. Unlike the
// directory list above, this is a deliberate hand-picked allowlist rather
// than a full disk scan: the repo root also holds ~20 other real files
// (LICENSE, .editorconfig, .prettierrc.js, CODE_OF_CONDUCT.md, ...) that are
// essentially never the subject of "files to modify" prose, and whose bare
// (slash-less) names are far more collision-prone against ordinary English
// than a slash-qualified directory token — scanning all of them in would
// widen the false-positive surface for no real benefit. Extend this list if
// a real issue body needs a filename it's missing.
const ROOT_LEVEL_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "README.md",
  "package.json",
  "turbo.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "vitest.config.ts",
  "eslint.config.js",
];

const ROOT_LEVEL_DIRS = buildRootDirList();

/**
 * Escapes regex metacharacters so a literal directory/file name can be
 * embedded in an alternation.
 *
 * @param {string} token
 * @returns {string}
 */
function escapeRegExp(token) {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the body path-token pattern from the workspace roots plus the
 * disk-derived/hand-picked root-level allowlists.
 *
 * A path token must start with one of these recognized roots so prose like
 * "main", "CI Gate", or "origin/main" can never be mistaken for a path.
 * Bounded, non-overlapping character classes keep this linear-time (no
 * nested-quantifier backtracking risk) even on adversarial issue bodies.
 *
 * The directory alternation uses a negative lookbehind, not `\b`, as its
 * left boundary: `\b` fires on a \w/\W transition, but dot-prefixed dirs
 * (`.claude`, `.github`) start with a \W char, so a preceding space (also
 * \W) gives no transition and `\b` would never match. `(?<![\w.])` — "not
 * preceded by a word char or a dot" — works identically to `\b` for
 * word-initial names (e.g. "scripts") and additionally handles dot-initial
 * ones, so a single alternation covers both.
 *
 * @param {string[]} workspaceRoots
 * @param {string[]} rootDirs
 * @param {string[]} rootFiles
 * @returns {RegExp}
 */
function buildPathTokenPattern(workspaceRoots, rootDirs, rootFiles) {
  const dirAlt = [...workspaceRoots, ...rootDirs].map(escapeRegExp).join("|");
  const dirPattern = `(?<![\\w.])(?:${dirAlt})/[\\w.-]+(?:/[\\w.-]+)*`;
  if (rootFiles.length === 0) return new RegExp(dirPattern, "g");
  const fileAlt = rootFiles.map(escapeRegExp).join("|");
  return new RegExp(`${dirPattern}|\\b(?:${fileAlt})\\b`, "g");
}

const PATH_TOKEN_PATTERN = buildPathTokenPattern(
  WORKSPACE_ROOTS,
  ROOT_LEVEL_DIRS,
  ROOT_LEVEL_FILES
);

/**
 * Extracts the `## Files to Modify/Create` section body (text between that
 * heading and the next heading, or end of string), or null if absent.
 *
 * @param {string} body
 * @returns {string | null}
 */
function extractFilesSection(body) {
  const headingMatch = FILES_SECTION_HEADING.exec(body);
  if (!headingMatch) return null;
  const rest = body.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingMatch = HEADING_LINE.exec(rest);
  return nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;
}

/**
 * Extracts candidate repo-relative paths from an issue body.
 *
 * Prefers the `## Files to Modify/Create` section (the shape `/decompose`
 * generates) when present and non-empty; otherwise scans the whole body.
 *
 * @param {unknown} body
 * @returns {string[]}
 */
function extractPathsFromBody(body) {
  if (typeof body !== "string" || body.length === 0) return [];
  const section = extractFilesSection(body);
  if (section) {
    const sectionPaths = section.match(PATH_TOKEN_PATTERN) ?? [];
    if (sectionPaths.length > 0) return sectionPaths;
  }
  return body.match(PATH_TOKEN_PATTERN) ?? [];
}

// ---------------------------------------------------------------------------
// Zone estimation
// ---------------------------------------------------------------------------

/**
 * Extracts the conventional-commit scope tokens from a title.
 *
 * Handles `type(scope): …`, `type(scope)!: …`, and comma-separated scopes
 * (`type(a,b): …`). A scopeless (`type: …`) or non-conventional title yields
 * an empty list. Tokens are lower-cased for case-insensitive matching.
 *
 * @param {string} title
 * @returns {string[]}
 */
function parseScopes(title) {
  if (typeof title !== "string") return [];
  const match = /^\s*[a-zA-Z]+(?:\(([^)]*)\))?!?:/.exec(title.trim());
  if (!match || !match[1]) return [];
  return match[1]
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Estimates the zone from the title's conventional-commit scope(s) alone.
 *
 * Each scope resolves to a workspace zone or null (global). A single distinct
 * zone → that zone; a single distinct null → global; a mix (or >1 zone) →
 * cross-cutting → global. Identical to merge-train-lock's zoneForPaths.
 *
 * @param {unknown} title
 * @returns {string | null}
 */
function titleZone(title) {
  const scopes = parseScopes(title);
  if (scopes.length === 0) return null;
  const zones = new Set(
    scopes.map((s) => SCOPE_ZONE_MAP.get(s) ?? EXTRA_SCOPE_ZONE_MAP.get(s) ?? null)
  );
  return zones.size === 1 ? [...zones][0] : null;
}

/**
 * Estimates the merge-train zone an issue's PR will most likely occupy.
 *
 * 1. Title-derived zone (conventional-commit scope) wins when present.
 * 2. Otherwise, falls back to paths named in the issue body (preferring a
 *    `## Files to Modify/Create` section — the shape `/decompose` emits),
 *    resolved through the same `zoneForPaths` the merge-train lock uses.
 * 3. Anything still cross-cutting or scope/path-less → `null` = the GLOBAL
 *    lock, which serializes against everything (the conservative choice for
 *    a genuinely cross-cutting PR).
 *
 * @param {{ title?: string, labels?: unknown, body?: unknown }} issue
 * @returns {string | null} `<root>/<name>` zone, or null for global
 */
function issueZone(issue) {
  const title = issue && typeof issue === "object" ? issue.title : undefined;
  const fromTitle = titleZone(title);
  if (fromTitle !== null) return fromTitle;

  const body = issue && typeof issue === "object" ? issue.body : undefined;
  return zoneForPaths(extractPathsFromBody(body));
}

// ---------------------------------------------------------------------------
// Batch composition
// ---------------------------------------------------------------------------

/**
 * Composes a claim batch that maximizes distinct merge-train zones.
 *
 * Preserving the caller's priority order, it takes at most one issue per
 * distinct zone (up to `maxWorkers`), deferring same-zone surplus to a later
 * batch. `null`-zone (global/cross-cutting) issues each occupy the single
 * global slot, so at most ONE global is scheduled per batch — a global PR takes
 * the global lock and serializes against every other train, so co-scheduling
 * two would reintroduce the very serialization this avoids.
 *
 * Pure and deterministic: no I/O, no mutation of inputs.
 *
 * @param {Array<object>} candidates — issues in priority order (highest first)
 * @param {{ maxWorkers?: number }} [opts]
 * @returns {Array<object>} selected issues (subset of `candidates`, in order)
 */
function selectZoneSpreadBatch(candidates, { maxWorkers = DEFAULT_MAX_WORKERS } = {}) {
  if (!Array.isArray(candidates) || maxWorkers <= 0) return [];

  const batch = [];
  const occupied = new Set(); // holds zone strings and, at most once, null
  for (const issue of candidates) {
    if (batch.length >= maxWorkers) break;
    const zone = issueZone(issue);
    if (occupied.has(zone)) continue; // zone already claimed → defer this one
    occupied.add(zone); // null counts as its own single occupancy
    batch.push(issue);
  }
  return batch;
}

export { issueZone, selectZoneSpreadBatch, buildScopeZoneMap, SCOPE_ZONE_MAP, DEFAULT_MAX_WORKERS };
